from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee, Project, Commitment
from backend.app.schemas import DependencyCreate, WorkCreate, WorkPatch, Assignment
from backend.app.services.dependencies import create_dependency
from backend.app.core.security import current_user
from backend.app.services.work import get_work, create_work, patch_work, serialize_work, assign_work

router = APIRouter()

@router.post('/api/work', status_code=201)
def new_work(body: WorkCreate, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    work = create_work(db, user, body)
    for dependency in body.dependencies:
        create_dependency(db, user, DependencyCreate(work_item_id=work.id, **dependency.model_dump()), creating=True)
    db.commit()
    return serialize_work(db, work, user)

@router.patch('/api/work/{work_id}')
def update_work(work_id: int, body: WorkPatch, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    work = patch_work(db, user, get_work(db, user, work_id, edit=True), body)
    db.commit()
    return serialize_work(db, work)

@router.get('/api/work/{work_id}/history')
def history(work_id: int, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    get_work(db, user, work_id)
    return [{'revision': c.revision, 'start_date': str(c.start_date), 'due_date': str(c.due_date), 'effort_hours': c.effort_hours, 'reason': c.reason, 'confirmed_by': c.confirmed_by} for c in db.scalars(select(Commitment).where(Commitment.work_item_id == work_id).order_by(Commitment.revision.desc()))]

@router.post('/api/work/{work_id}/assign')
def assign(work_id: int, body: Assignment, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    work = assign_work(db, user, get_work(db, user, work_id), body.employee_id)
    db.commit()
    return serialize_work(db, work, user)
