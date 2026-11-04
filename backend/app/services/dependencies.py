from fastapi import HTTPException
from backend.app.models import Employee, Project, Dependency
from backend.app.services.work import get_work, audit, notify, downstream, sync_blocked, participates_in_project


def create_dependency(db, user, body):
    """Record that the user's work waits on someone. Shared by the API and the dependency agent; no commit."""
    work = get_work(db, user, body.work_item_id, edit=True)
    if work.status == 'Completed':
        raise HTTPException(409, 'Reopen the work before adding a dependency.')
    owner = db.get(Employee, body.owner_id)
    if not participates_in_project(db, owner, db.get(Project, work.project_id)):
        raise HTTPException(422, 'Select an active participant or member of the project department.')
    if body.upstream_work_id:
        get_work(db, user, body.upstream_work_id)
        if body.upstream_work_id == work.id or body.upstream_work_id in downstream(db, work.id):
            raise HTTPException(409, 'This dependency would create a circular chain.')
    dep = Dependency(**body.model_dump(), requester_id=user.id, previous_work_status=work.status)
    db.add(dep)
    db.flush()
    sync_blocked(db, work)
    audit(db, user, f'Requested “{dep.deliverable}” from {owner.name}. Work is {"partially" if dep.partial else "fully"} blocked.', work.id)
    notify(db, owner.id, f'requested:{dep.id}', f'{user.name} needs {dep.deliverable} by {dep.due_date}.', work.id)
    return dep
