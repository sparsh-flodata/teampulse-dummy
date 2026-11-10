from fastapi import HTTPException
from backend.app.models import Commitment, Employee, Project, Dependency, WorkItem
from backend.app.services.work import (
    audit, downstream, ensure_participant, get_work, manager, notify, participates_in_project, sync_blocked, today,
)


def create_dependency(db, user, body, creating=False):
    """Record that a commitment waits on someone. Shared by the API, the create form and the dependency agent; no commit.

    Unless an existing commitment is named as the upstream work, a new commitment is created for the person
    it waits on (they confirm it, like any assignment). When that commitment is completed the dependency is
    fulfilled (see sync_upstream_dependencies in services/work.py).
    """
    # `creating`: the commitment was just created in this request by the same person.
    work = get_work(db, user, body.work_item_id, edit=not creating)
    if work.status == 'Completed':
        raise HTTPException(409, 'Reopen the work before adding a dependency.')
    project = db.get(Project, work.project_id)
    owner = db.get(Employee, body.owner_id)
    if not owner or not owner.active:
        raise HTTPException(422, 'Choose an active person.')
    if manager(user):
        # Managers and administrators can ask anyone in the organization; they join the project.
        ensure_participant(db, user, owner, project)
    elif not participates_in_project(db, owner, project):
        raise HTTPException(422, 'Select an active participant or member of the project department.')
    if body.upstream_work_id:
        get_work(db, user, body.upstream_work_id)
        if body.upstream_work_id == work.id or body.upstream_work_id in downstream(db, work.id):
            raise HTTPException(409, 'This dependency would create a circular chain.')
    fields = body.model_dump(exclude={'effort_hours'})
    linked = None
    if not body.upstream_work_id:
        linked = WorkItem(title=body.deliverable, description=(f'Needed by “{work.title}”. ' + body.reason).strip()[:4000],
                          project_id=work.project_id, owner_id=owner.id, remaining_hours=body.effort_hours,
                          priority='High' if body.impact in ('High', 'Critical') else 'Medium')
        db.add(linked)
        db.flush()
        db.add(Commitment(work_item_id=linked.id, start_date=today(), due_date=max(body.due_date, today()),
                          effort_hours=body.effort_hours, confirmed_by=None))
        fields['upstream_work_id'] = linked.id
        audit(db, user, f'Created “{linked.title}” for {owner.name} as the commitment “{work.title}” waits on; awaiting their confirmation.', linked.id)
    dep = Dependency(**fields, requester_id=user.id, previous_work_status=work.status)
    db.add(dep)
    db.flush()
    sync_blocked(db, work)
    audit(db, user, f'Requested “{dep.deliverable}” from {owner.name}. Work is {"partially" if dep.partial else "fully"} blocked.', work.id)
    where = ' A commitment for it is waiting for you to confirm.' if linked else ''
    notify(db, owner.id, f'requested:{dep.id}', f'{user.name} needs {dep.deliverable} by {dep.due_date}.{where}', linked.id if linked else work.id)
    return dep
