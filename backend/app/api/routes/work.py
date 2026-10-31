from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee, Project, Commitment
from backend.app.schemas import WorkCreate, WorkPatch, Assignment
from backend.app.core.security import current_user, require_manager
from backend.app.core.access import can_manage_person
from backend.app.services.work import get_work, latest_commitment, create_work, patch_work, serialize_work, audit, notify, participates_in_project

router = APIRouter()

@router.post('/api/work', status_code=201)
def new_work(body: WorkCreate, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    work = create_work(db, user, body)
    db.commit()
    return serialize_work(db, work)

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
    require_manager(user)
    work = get_work(db, user, work_id, edit=True)
    if work.owner_id:
        raise HTTPException(409, 'This work already has an owner. Existing work is not silently reassigned.')
    person = db.get(Employee, body.employee_id)
    if not participates_in_project(db, person, db.get(Project, work.project_id)):
        raise HTTPException(422, 'Select an employee on the project team.')
    if person.id != user.id and not can_manage_person(db, user, person.id):
        raise HTTPException(403, 'You can only assign work within your reporting team.')
    work.owner_id = person.id
    work.confirmed_at = None
    latest_commitment(db, work.id).confirmed_by = None
    audit(db, user, f'Proposed “{work.title}” to {person.name}; awaiting employee confirmation.', work.id)
    notify(db, person.id, f'assigned:{work.id}', f'Please review and confirm the proposed commitment: {work.title}.', work.id)
    db.commit()
    return serialize_work(db, work)
