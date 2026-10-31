import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee, Project, Dependency
from backend.app.schemas import DependencyCreate, DependencyPatch
from backend.app.core.security import current_user
from backend.app.core.access import can_manage_person
from backend.app.services.work import get_work, serialize_dependency, audit, notify, downstream, sync_blocked, participates_in_project

router = APIRouter()

@router.post('/api/dependencies', status_code=201)
def new_dependency(body: DependencyCreate, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
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
    db.commit()
    return serialize_dependency(dep)

@router.patch('/api/dependencies/{dep_id}')
def update_dependency(dep_id: int, body: DependencyPatch, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    dep = db.get(Dependency, dep_id)
    if not dep:
        raise HTTPException(404, 'Dependency not found.')
    work = get_work(db, user, dep.work_item_id)
    if body.status == 'Verified':
        if dep.requester_id != user.id:
            raise HTTPException(403, 'The requester must verify that the deliverable is usable.')
        if dep.status != 'Delivered':
            raise HTTPException(409, 'The owner must deliver the dependency before verification.')
    elif body.status == 'Cancelled':
        if dep.requester_id != user.id and not (user.role == 'admin' or can_manage_person(db, user, work.owner_id)):
            raise HTTPException(403, 'The requester or manager must cancel this dependency.')
    elif dep.owner_id != user.id:
        raise HTTPException(403, 'Only the dependency owner can report delivery progress.')
    if dep.status in ('Verified', 'Cancelled'):
        raise HTTPException(409, 'This dependency is already resolved.')
    dep.status = body.status
    db.flush()
    sync_blocked(db, work)
    audit(db, user, f'Dependency “{dep.deliverable}” → {dep.status}.', work.id)
    recipient = dep.requester_id if user.id == dep.owner_id else dep.owner_id
    notify(db, recipient, f'dep-update:{dep.id}:{secrets.token_hex(6)}', f'{dep.deliverable}: {dep.status}.', work.id)
    db.commit()
    return serialize_dependency(dep)
