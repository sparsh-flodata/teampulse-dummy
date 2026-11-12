"""Project overview: everything one project page shows, within the viewer's access.

Commitments are the ones the viewer may see (visible_work), so a manager who sees a
project only through a report's work sees that work, not the whole project.
"""
from fastapi import HTTPException
from sqlalchemy import select
from backend.app.core.access import directory_person
from backend.app.models import AuditEvent, Dependency, Employee, ProjectMember, Team
from backend.app.services.work import (
    ACTIVE, downstream, health_summary, manager, participates_in_project, prefetch_work_context, serialize_dependency,
    serialize_work, today, visible_projects, visible_work,
)
from backend.app.core.access import profile_ids

STATUSES = ('Planned', 'In Progress', 'Partially Blocked', 'Blocked', 'Awaiting Verification', 'Completed')


def project_detail(db, user, project_id: int) -> dict:
    project = next((p for p in visible_projects(db, user) if p.id == project_id), None)
    if not project:
        raise HTTPException(404, 'Project not found.')
    works = [w for w in visible_work(db, user) if w.project_id == project.id]
    prefetch_work_context(db, works, profile_ids(db, user))
    serialized = [serialize_work(db, w, user) for w in works]
    ids = {w['id'] for w in serialized}
    team = db.get(Team, project.team_id)

    # People involved: members (added, or assigned work here), and anyone else owning work here.
    invited = list(db.scalars(select(Employee).join(ProjectMember, ProjectMember.employee_id == Employee.id)
                              .where(ProjectMember.project_id == project.id, Employee.active.is_(True))))
    owners = {w['owner_id'] for w in serialized if w['owner_id']}
    people, involvement = {}, {}
    for person in invited:
        people.setdefault(person.id, person)
        involvement.setdefault(person.id, 'Invited')
    for owner_id in owners - people.keys():
        person = db.get(Employee, owner_id)
        if person:
            people[person.id], involvement[person.id] = person, 'Contributor'
    members = []
    for person in people.values():
        mine = [w for w in serialized if w['owner_id'] == person.id]
        active = [w for w in mine if w['status'] != 'Completed']
        members.append(directory_person(db, user, person) | {
            'involvement': involvement[person.id], 'is_lead': bool(team and team.lead_id == person.id),
            'open_count': len(active), 'completed_count': len(mine) - len(active),
            'remaining_hours': round(sum(w['remaining_hours'] for w in active), 1),
            'needs_action': sum(w['tone'] == 'red' for w in active),
        })
    # The lead first, then whoever carries the most open work here.
    members.sort(key=lambda m: (not m['is_lead'], -m['needs_action'], -m['open_count'], m['name']))

    active = [w for w in serialized if w['status'] != 'Completed']
    effort = sum(w['effort_hours'] or 0 for w in serialized)
    due_dates = [w['due_date'] for w in serialized if w['due_date']]
    upcoming = sorted((w for w in active if w['due_date']), key=lambda w: w['due_date'])
    stats = {
        'total': len(serialized), 'active': len(active), 'completed': len(serialized) - len(active),
        'by_status': {s: sum(w['status'] == s for w in serialized) for s in STATUSES},
        'overdue': sum(w['health'] == 'Overdue' for w in active),
        'needs_action': sum(w['tone'] == 'red' for w in active),
        'needs_review': sum(w['tone'] == 'amber' for w in active),
        'unassigned': sum(w['owner_id'] is None for w in active),
        'awaiting_confirmation': sum(not w['commitment_confirmed'] for w in active if w['owner_id']),
        'remaining_hours': round(sum(w['remaining_hours'] for w in active), 1),
        'effort_hours': round(effort, 1),
        # Effort-weighted, so a 40-hour task counts more than a 2-hour one.
        'progress': round(sum((w['progress'] or 0) * (w['effort_hours'] or 0) for w in serialized) / effort) if effort else 0,
        'start_date': min((w['start_date'] for w in serialized if w['start_date']), default=None),
        'target_date': max(due_dates, default=None),
        'next_due': [w['id'] for w in upcoming[:5]],
    }
    deps = list(db.scalars(select(Dependency).where(Dependency.work_item_id.in_(ids)).order_by(Dependency.due_date)))
    events = db.scalars(select(AuditEvent).where(AuditEvent.work_item_id.in_(ids)).order_by(AuditEvent.id.desc()).limit(80))
    member = participates_in_project(db, user, project)
    return {
        'project': {'id': project.id, 'name': project.name, 'description': project.description, 'color': project.color,
                    'team_id': project.team_id, 'team_name': team.name if team else None,
                    'lead_id': team.lead_id if team else None, 'health': health_summary(serialized)},
        'today': str(today()),
        'members': members,
        'work': serialized,
        'stats': stats,
        'dependencies': [serialize_dependency(d) | {'downstream_count': len(downstream(db, d.work_item_id) & ids)} for d in deps],
        'activity': [{'id': e.id, 'actor_id': e.actor_id, 'work_item_id': e.work_item_id, 'message': e.message,
                      'created_at': e.created_at.isoformat() + 'Z'} for e in events],
        'permissions': {
            # Managers and administrators assign or reassign to anyone in the organization.
            'can_assign': manager(user),
            # Every project member can take an unassigned commitment and create their own.
            'is_member': member,
            'can_take': member or manager(user),
            'can_create': member or manager(user),
            # Administrators, and managers on the project, add and remove people; anyone on it can leave.
            'can_manage_members': can_manage_members(db, user, project),
            'can_leave': member,
        },
    }


# ---- Membership -------------------------------------------------------------------------------------

def can_manage_members(db, user, project) -> bool:
    return user.role == 'admin' or (user.role == 'manager' and participates_in_project(db, user, project))


def add_project_member(db, actor, person, project):
    from backend.app.models import ProjectMember, now
    from backend.app.services.work import audit, notify
    if not person or not person.active:
        raise HTTPException(422, 'Choose an active teammate.')
    if db.get(ProjectMember, (project.id, person.id)):
        raise HTTPException(409, f'{person.name} is already on this project.')
    db.add(ProjectMember(project_id=project.id, employee_id=person.id))
    db.flush()
    audit(db, actor, f'Added {person.name} to the project "{project.name}".')
    if person.id != actor.id:
        notify(db, person.id, f'project-added:{project.id}:{person.id}:{now():%Y%m%d%H%M%S%f}',
               f'{actor.name} added you to the project "{project.name}".')


def remove_project_member(db, actor, person, project):
    """Leave a project, or remove someone from it. Refused while they have open commitments there."""
    from backend.app.models import ProjectMember, WorkItem, now
    from backend.app.services.work import audit, notify
    open_work = list(db.scalars(select(WorkItem).where(WorkItem.project_id == project.id, WorkItem.owner_id == person.id,
                                                       WorkItem.status != 'Completed').order_by(WorkItem.id)))
    if open_work:
        titles = ', '.join(f'"{w.title}"' for w in open_work[:4]) + (f' and {len(open_work) - 4} more' if len(open_work) > 4 else '')
        who = 'You have' if person.id == actor.id else f'{person.name} has'
        raise HTTPException(409, f'{who} open commitments in this project: {titles}. Reassign or finish them first.')
    member = db.get(ProjectMember, (project.id, person.id))
    if not member:
        raise HTTPException(409, f'{person.name} is not on this project.')
    db.delete(member)
    db.flush()
    if person.id == actor.id:
        audit(db, actor, f'Left the project "{project.name}".')
    else:
        audit(db, actor, f'Removed {person.name} from the project "{project.name}".')
        notify(db, person.id, f'project-removed:{project.id}:{person.id}:{now():%Y%m%d%H%M%S%f}',
               f'{actor.name} removed you from the project "{project.name}".')
