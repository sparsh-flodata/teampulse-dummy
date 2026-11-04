import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select, or_
from backend.app.models import Employee, Project, WorkItem, Commitment, Dependency, AuditEvent, Notification, ProjectMember, now
from backend.app.schemas import WorkCreate, WorkPatch
from backend.app.core.access import profile_ids, can_manage_person

ACTIVE = ('Planned', 'In Progress', 'Partially Blocked', 'Blocked', 'Awaiting Verification')
OPEN_DEP = ('Requested', 'Accepted', 'In Progress', 'At Risk', 'Blocked', 'Delivered')

def today():
    return datetime.now(ZoneInfo(os.getenv('APP_TIMEZONE', 'Asia/Kolkata'))).date()

def business_day(start: date, days: int):
    while days > 0:
        start += timedelta(days=1)
        if start.weekday() < 5:
            days -= 1
    return start

def manager(user):
    return user.role in ('manager', 'admin')

def project_member_ids(db, project):
    department = set(db.scalars(select(Employee.id).where(Employee.team_id == project.team_id, Employee.active.is_(True))))
    invited = set(db.scalars(select(ProjectMember.employee_id).join(Employee, Employee.id == ProjectMember.employee_id).where(ProjectMember.project_id == project.id, Employee.active.is_(True))))
    return department | invited


def participates_in_project(db, person, project):
    return bool(person and person.active and project and not project.archived and
                (person.team_id == project.team_id or db.get(ProjectMember, (project.id, person.id))))


def shared_project_ids(user):
    memberships = select(ProjectMember.project_id).where(ProjectMember.employee_id == user.id)
    return select(Project.id).where(Project.archived.is_(False), or_(Project.team_id == user.team_id, Project.id.in_(memberships)))


def visible_projects(db, user):
    q = select(Project).where(Project.archived.is_(False))
    if user.role != 'admin':
        owned_projects = select(WorkItem.project_id).where(WorkItem.owner_id.in_(profile_ids(db, user)))
        q = q.where(or_(Project.id.in_(shared_project_ids(user)), Project.id.in_(owned_projects)))
    return list(db.scalars(q))


def visible_work(db, user):
    q = select(WorkItem).join(Project).where(Project.archived.is_(False))
    if user.role != 'admin':
        q = q.where(or_(WorkItem.project_id.in_(shared_project_ids(user)), WorkItem.owner_id.in_(profile_ids(db, user))))
    return list(db.scalars(q.order_by(WorkItem.id.desc())))


def can_edit_work(db, user, work):
    return user.role == 'admin' or work.owner_id == user.id or (work.owner_id is not None and can_manage_person(db, user, work.owner_id)) or (work.owner_id is None and manager(user) and db.get(Project, work.project_id).team_id == user.team_id)


def get_work(db, user, work_id, edit=False):
    work = db.get(WorkItem, work_id)
    if not work or work.id not in {w.id for w in visible_work(db, user)}:
        raise HTTPException(404, 'Work item not found.')
    if edit and not can_edit_work(db, user, work):
        raise HTTPException(403, 'You can update your own work and work in your reporting team.')
    return work


def latest_commitment(db, work_id):
    cached=db.info.get('commitments_by_work',{})
    if work_id in cached:return cached[work_id]
    return db.scalar(select(Commitment).where(Commitment.work_item_id == work_id).order_by(Commitment.revision.desc()).limit(1))

def audit(db, user, message, work_id=None):
    db.add(AuditEvent(actor_id=user.id, work_item_id=work_id, message=message))

# Workflow nudges that also go to Google Chat for people who connected it.
# Update requests are sent by their own channel adapter.
CHAT_MIRRORED = ('planning', 'weekly', 'due', 'overdue', 'dependency', 'escalation', 'requested', 'update-response')

def notify(db, recipient, key, message, work_id=None):
    if recipient and not db.scalar(select(Notification.id).where(Notification.key == key)):
        db.add(Notification(recipient_id=recipient, key=key, message=message, work_item_id=work_id))
        db.flush()
        if key.split(':', 1)[0] in CHAT_MIRRORED:
            from backend.app.channels.google_chat import queue_message
            from backend.app.core.config import app_link
            queue_message(db, recipient, f'{message}\n{app_link("/")}'.rstrip())

def sync_blocked(db, work):
    deps = list(db.scalars(select(Dependency).where(Dependency.work_item_id == work.id, Dependency.status.in_(OPEN_DEP))))
    if work.status in ('Completed', 'Awaiting Verification'):
        return
    if deps:
        work.status = 'Blocked' if any(not d.partial for d in deps) else 'Partially Blocked'
    elif work.status in ('Blocked', 'Partially Blocked'):
        # Resolution restores executable work, never implicitly completes it.
        work.status = 'In Progress'

def create_work(db, user, body: WorkCreate):
    project = db.get(Project, body.project_id)
    if not project or project.id not in [p.id for p in visible_projects(db, user)]:
        raise HTTPException(404, 'Project not found.')
    owner_id = body.owner_id
    if not manager(user) and owner_id != user.id:
        raise HTTPException(403, 'You can create work for yourself; managers assign team work.')
    owner = db.get(Employee, owner_id) if owner_id else None
    if owner_id and owner_id != user.id and not can_manage_person(db, user, owner_id):
        raise HTTPException(403, 'You can only assign work within your reporting team.')
    if owner and not owner.active:
        raise HTTPException(422, 'This employee is inactive.')
    if owner_id and not participates_in_project(db, owner, project):
        raise HTTPException(422, 'The owner must belong to the owning department or participate in this project.')
    if body.due_date < today():
        raise HTTPException(422, 'New commitments must be due today or later.')
    work = WorkItem(title=body.title, description=body.description, project_id=body.project_id, owner_id=owner_id,
                    priority=body.priority, remaining_hours=body.effort_hours, required_skills=body.required_skills,
                    confirmed_at=now() if owner_id == user.id else None)
    db.add(work)
    db.flush()
    db.add(Commitment(work_item_id=work.id, start_date=today(), due_date=body.due_date, effort_hours=body.effort_hours,
                      confirmed_by=user.id if owner_id == user.id else None))
    audit(db, user, f'Created “{work.title}” · {body.effort_hours:g}h estimated effort.', work.id)
    if owner_id and owner_id != user.id:
        notify(db, owner_id, f'assigned:{work.id}', f'New proposed commitment: {work.title}. Review and confirm feasibility.', work.id)
    db.flush()
    return work

def patch_work(db, user, work, body: WorkPatch):
    commitment = latest_commitment(db, work.id)
    if body.due_date and body.due_date != commitment.due_date:
        if user.id != work.owner_id:
            raise HTTPException(403, 'The work owner must confirm a revised delivery date.')
        if len(body.note) < 3:
            raise HTTPException(422, 'Please explain why the expected completion date changed.')
        if body.due_date < commitment.start_date:
            raise HTTPException(422, 'Completion cannot precede the commitment start date.')
        db.add(Commitment(work_item_id=work.id, revision=commitment.revision + 1, start_date=commitment.start_date,
                          due_date=body.due_date, effort_hours=commitment.effort_hours, reason=body.note, confirmed_by=user.id))
        audit(db, user, f'Revised expected completion from {commitment.due_date} to {body.due_date}. Reason: {body.note}', work.id)
    if body.priority and body.priority != work.priority:
        if not manager(user):
            raise HTTPException(403, 'Ask your manager to change an existing priority.')
        if len(body.note) < 3:
            raise HTTPException(422, 'Explain the priority change so affected people have context.')
    if body.status == 'Completed':
        if user.id != work.owner_id:
            raise HTTPException(403, 'The work owner must confirm completion.')
        if db.scalar(select(Dependency.id).where(Dependency.work_item_id == work.id, Dependency.status.in_(OPEN_DEP))):
            raise HTTPException(409, 'Verify or cancel unresolved dependencies before completing this work.')
        work.progress = 100
        work.remaining_hours = 0
    if body.accept_commitment:
        if user.id != work.owner_id:
            raise HTTPException(403, 'Only the owner can confirm this commitment.')
        commitment.confirmed_by = user.id
    for field in ('status', 'progress', 'remaining_hours', 'priority', 'risk'):
        value = getattr(body, field)
        if value is not None:
            setattr(work, field, value)
    if work.status == 'Completed':
        work.progress, work.remaining_hours, work.risk = 100, 0, False
    if user.id == work.owner_id:
        work.confirmed_at = now()
    db.flush()
    sync_blocked(db, work)
    audit(db, user, body.note or f'Updated “{work.title}” · {work.status} · {work.progress}%.', work.id)
    db.flush()
    return work

def capacity(db, person):
    cached=db.info.get('active_work_by_owner',{})
    works = cached[person.id] if person.id in cached else list(db.scalars(select(WorkItem).join(Project).where(Project.archived.is_(False), WorkItem.owner_id == person.id, WorkItem.status.in_(ACTIVE))))
    week_end = business_day(today(), 5)
    # Only efforts committed in the rolling five-workday planning horizon count here.
    included = [w for w in works if (c := latest_commitment(db, w.id)) and c.due_date <= week_end]
    committed = sum(w.remaining_hours for w in included)
    usable = max(0, person.weekly_hours - person.reserved_hours)
    available = max(0, usable - committed)
    confirmed = bool(person.capacity_confirmed and person.capacity_confirmed_on and (today() - person.capacity_confirmed_on).days < 7)
    state = 'Unknown' if not confirmed else 'Overloaded' if committed > usable else 'Fully allocated' if available < 2 else 'Partially available' if available < usable / 2 else 'Available'
    return {'committed': committed, 'usable': usable, 'available': available if confirmed else None,
            'estimated_available': available, 'state': state, 'confirmed': confirmed, 'blocked_count': sum(w.status in ('Blocked', 'Partially Blocked') for w in works),
            'utilization': round(committed / usable * 100) if usable else (100 if committed else 0)}

def work_health(db, work):
    c = latest_commitment(db, work.id)
    cached=db.info.get('dependencies_by_work',{})
    deps = cached[work.id] if work.id in cached else list(db.scalars(select(Dependency).where(Dependency.work_item_id == work.id, Dependency.status.in_(OPEN_DEP))))
    stale = not work.confirmed_at or (now() - work.confirmed_at).total_seconds() > 36 * 3600
    def result(health, tone, reason, action):
        return {'health': health, 'tone': tone, 'health_reason': reason, 'next_action': action}
    if work.status == 'Completed':
        return result('Completed', 'green', 'Completion was explicitly confirmed by the owner.', 'No intervention needed.')
    if work.status == 'Blocked' or any(not d.partial for d in deps):
        return result('Action needed', 'red', 'Required work cannot continue until its dependency is resolved.', 'Coordinate delivery with the dependency owner.')
    if c and c.due_date < today():
        return result('Overdue', 'red', 'The agreed completion date has passed; completion is not confirmed.', 'Ask the owner what changed and agree on the next step.')
    if any(d.due_date < today() or d.status in ('At Risk', 'Blocked') for d in deps):
        return result('Dependency at risk', 'red', 'A required deliverable is overdue or its owner reported a risk.', 'Review the dependency and its downstream impact.')
    if work.risk:
        return result('At risk', 'red', 'A delivery risk has been explicitly recorded.', 'Review the recorded risk with the owner.')
    if c and c.due_date <= today() and stale:
        return result('Progress unconfirmed', 'amber', 'Work is due, but there is no recent confirmation from its owner.', 'Request a meaningful progress update.')
    if deps or work.status == 'Partially Blocked':
        return result('Review dependency', 'amber', 'A dependency remains open; other work can continue.', 'Confirm the expected delivery time without interrupting ongoing work.')
    if work.status == 'Awaiting Verification':
        return result('Awaiting verification', 'amber', 'The deliverable is ready for review.', 'Arrange verification with the appropriate reviewer.')
    if not c or not c.confirmed_by:
        return result('Awaiting confirmation', 'neutral', 'The proposed commitment has not been accepted by its owner.', 'Ask the owner to confirm feasibility.')
    if stale:
        return result('Update needed', 'neutral', 'The last owner confirmation is stale; current progress is unknown.', 'Confirm progress when appropriate; silence does not mean on track.')
    return result('On track', 'green', 'The owner has recently confirmed work, with no recorded delivery exceptions.', 'No intervention needed. Respect the current commitment.')


def serialize_work(db, work, user=None):
    c = latest_commitment(db, work.id)
    return {'id': work.id, 'title': work.title, 'description': work.description, 'project_id': work.project_id,
            'owner_id': work.owner_id, 'status': work.status, 'priority': work.priority, 'progress': work.progress,
            'remaining_hours': work.remaining_hours, 'required_skills': work.required_skills, 'risk': work.risk,
            'confirmed_at': work.confirmed_at.isoformat() + 'Z' if work.confirmed_at else None,
            'due_date': str(c.due_date) if c else None, 'start_date': str(c.start_date) if c else None,
            'effort_hours': c.effort_hours if c else 0, 'revision': c.revision if c else 0, 'commitment_confirmed': bool(c and c.confirmed_by),
            'can_edit': can_edit_work(db, user, work) if user else False, **work_health(db, work)}


def health_summary(works):
    counts = {tone: sum(w['tone'] == tone and w['status'] != 'Completed' for w in works) for tone in ('green', 'amber', 'red', 'neutral')}
    active = [w for w in works if w['status'] != 'Completed']
    tone = 'red' if counts['red'] else 'amber' if counts['amber'] else 'neutral' if counts['neutral'] or not works else 'green'
    labels = {'green': 'On track', 'amber': 'Needs review', 'red': 'Action needed', 'neutral': 'Confirmation needed'}
    return {'tone': tone, 'label': 'All commitments complete' if works and not active else labels[tone], 'counts': counts, 'active': len(active), 'completed': sum(w['status'] == 'Completed' for w in works)}


def serialize_person(db, p):
    return {k: getattr(p, k) for k in ('id', 'name', 'email', 'role', 'title', 'team_id', 'manager_id', 'skills', 'weekly_hours', 'reserved_hours', 'planning', 'color', 'active', 'agent_auto_updates')} | {'capacity': capacity(db, p)}

def serialize_dependency(d):
    tone = 'green' if d.status in ('Verified', 'Cancelled') else 'red' if (not d.partial or d.due_date < today() or d.status in ('At Risk', 'Blocked')) else 'amber'
    return {'tone': tone} | {k: (str(getattr(d, k)) if k == 'due_date' else getattr(d, k)) for k in ('id', 'work_item_id', 'upstream_work_id', 'requester_id', 'owner_id', 'deliverable', 'reason', 'due_date', 'impact', 'partial', 'status')}

def downstream(db, start_id):
    edges = list(db.scalars(select(Dependency).where(Dependency.status.in_(OPEN_DEP))))
    seen, queue = {start_id}, [start_id]
    while queue:
        source = queue.pop()
        for d in edges:
            if d.upstream_work_id == source and d.work_item_id not in seen:
                seen.add(d.work_item_id)
                queue.append(d.work_item_id)
    return seen - {start_id}

def run_workflows(db):
    for person in db.scalars(select(Employee).where(Employee.active.is_(True))):
        if person.planning == 'On-demand':
            continue
        owned = list(db.scalars(select(WorkItem).join(Project).where(Project.archived.is_(False), WorkItem.owner_id == person.id, WorkItem.status.in_(ACTIVE))))
        has_plan = any((c := latest_commitment(db, w.id)) and c.confirmed_by for w in owned)
        week = today() - timedelta(days=today().weekday())
        if not has_plan:
            period = str(today()) if person.planning == 'Daily' else str(week)
            notify(db, person.id, f'planning:{person.id}:{period}', 'A little planning time: confirm your priorities and availability. Existing commitments are preserved.')
        elif person.planning in ('Weekly', 'Hybrid') and today().weekday() == 0:
            notify(db, person.id, f'weekly:{person.id}:{week}', 'Review this week’s priorities when convenient. Your multi-day commitments are remembered.')
    for work in db.scalars(select(WorkItem).join(Project).where(Project.archived.is_(False), WorkItem.status.in_(ACTIVE))):
        c = latest_commitment(db, work.id)
        if not c or not work.owner_id:
            continue
        if c.due_date <= today() and (not work.confirmed_at or (now() - work.confirmed_at).total_seconds() > 24 * 3600):
            notify(db, work.owner_id, f'due:{work.id}:{c.revision}:{today()}', f'Please confirm progress on {work.title}. Expected completion: {c.due_date}.', work.id)
        if c.due_date < today():
            owner = db.get(Employee, work.owner_id)
            notify(db, owner.manager_id, f'overdue:{work.id}:{c.revision}', f'{work.title} is past its expected completion. Review context with {owner.name}.', work.id)
    for dep in db.scalars(select(Dependency).join(WorkItem, Dependency.work_item_id == WorkItem.id).join(Project, WorkItem.project_id == Project.id).where(Project.archived.is_(False), Dependency.status.in_(OPEN_DEP), Dependency.due_date < today())):
        notify(db, dep.owner_id, f'dependency:{dep.id}:{today()}', f'Delivery update needed: {dep.deliverable}. Downstream work is waiting.', dep.work_item_id)
        if (today() - dep.due_date).days >= 2:
            owner = db.get(Employee, dep.owner_id)
            notify(db, owner.manager_id, f'escalation:{dep.id}', f'Dependency “{dep.deliverable}” is overdue. A coordination decision is needed.', dep.work_item_id)
    db.commit()


def prefetch_work_context(db, works, full_profile_ids):
    """Prime a read-request snapshot; mutation routes never use these caches."""
    ids=[w.id for w in works]
    commits={i:None for i in ids}
    for c in db.scalars(select(Commitment).where(Commitment.work_item_id.in_(ids)).order_by(Commitment.revision.desc())):
        if commits[c.work_item_id] is None:commits[c.work_item_id]=c
    db.info['commitments_by_work']=commits
    deps={i:[] for i in ids}
    for d in db.scalars(select(Dependency).where(Dependency.work_item_id.in_(ids),Dependency.status.in_(OPEN_DEP))):deps[d.work_item_id].append(d)
    db.info['dependencies_by_work']=deps
    owners={i:[] for i in full_profile_ids}
    for w in works:
        if w.owner_id in owners and w.status in ACTIVE:owners[w.owner_id].append(w)
    db.info['active_work_by_owner']=owners
