from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Team, Employee
from backend.app.schemas import Availability, EmployeeCreate
from backend.app.core.security import current_user, find_employee_by_email, hash_password, require_allowed_email, require_manager
from backend.app.core.access import validate_manager
from backend.app.services.work import today, serialize_person, audit

router = APIRouter()

@router.patch('/api/me/availability')
def availability(body: Availability, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    if body.reserved_hours > body.weekly_hours:
        raise HTTPException(422, 'Reserved time cannot exceed available working hours.')
    for key, value in body.model_dump().items():
        setattr(user, key, value)
    user.capacity_confirmed_on = today() if body.capacity_confirmed else None
    audit(db, user, 'Updated personal availability and planning preferences.')
    db.commit()
    return serialize_person(db, user)

@router.post('/api/employees', status_code=201)
def add_employee(body: EmployeeCreate, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    require_manager(user)
    if not db.get(Team, body.team_id):
        raise HTTPException(422, 'Team not found.')
    if user.role != 'admin' and (body.role != 'employee' or body.team_id != user.team_id or body.manager_id not in (None, user.id)):
        raise HTTPException(403, 'Managers can add employees to their own team and reporting line. Administrators manage other roles.')
    require_allowed_email(body.email)
    if find_employee_by_email(db, body.email):
        raise HTTPException(409, 'An account with this email already exists.')
    data = body.model_dump(exclude={'password', 'manager_id'})
    manager_id = body.manager_id if user.role == 'admin' and body.manager_id is not None else user.id
    validate_manager(db, -1, manager_id)
    person = Employee(**data, password_hash=hash_password(body.password), manager_id=manager_id)
    db.add(person)
    audit(db, user, f'Added {body.name} to the workspace.')
    db.commit()
    return serialize_person(db, person)
