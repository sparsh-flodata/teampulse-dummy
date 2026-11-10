import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee, Project, Dependency
from backend.app.schemas import DependencyCreate, DependencyPatch
from backend.app.core.security import current_user
from backend.app.core.access import can_manage_person
from backend.app.services.dependencies import create_dependency
from backend.app.services.work import get_work, serialize_dependency, audit, notify, downstream, sync_blocked, participates_in_project

router = APIRouter()

@router.post('/api/dependencies', status_code=201)
def new_dependency(body: DependencyCreate, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    dep = create_dependency(db, user, body)
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
