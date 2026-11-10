from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Team, Employee
from backend.app.schemas import TeamCreate, TeamPatch, EmployeePatch
from backend.app.core.security import current_user, revoke_employee_tokens
from backend.app.core.access import validate_manager, require_admin, validate_team_parent
from backend.app.services.work import serialize_person, audit
from backend.app.services.organization import validate_lead

router = APIRouter(prefix="/api")

@router.post('/teams', status_code=201)
def create_team(body: TeamCreate, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    require_admin(user)
    validate_team_parent(db, None, body.parent_id)
    validate_lead(db, body.lead_id)
    team = Team(**body.model_dump())
    db.add(team)
    audit(db, user, f'Created team “{body.name}”.')
    db.commit()
    return {'id': team.id}

@router.patch('/teams/{team_id}')
def edit_team(team_id: int, body: TeamPatch, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    require_admin(user)
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, 'Team not found.')
    fields = body.model_dump(exclude_unset=True)
    if 'parent_id' in fields:
        validate_team_parent(db, team.id, body.parent_id)
    if 'lead_id' in fields:
        validate_lead(db, body.lead_id)
    if 'name' in fields and not body.name:
        raise HTTPException(422, 'Team name cannot be empty.')
    for key, value in fields.items():
        setattr(team, key, value)
    audit(db, user, f'Updated team “{team.name}” and its reporting structure.')
    db.commit()
    return {'id': team.id}

@router.patch('/employees/{person_id}')
def edit_employee(person_id: int, body: EmployeePatch, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    require_admin(user)
    person = db.get(Employee, person_id)
    if not person:
        raise HTTPException(404, 'Employee not found.')
    fields = body.model_dump(exclude_unset=True)
    if any(value is None and key != 'manager_id' for key, value in fields.items()):
        raise HTTPException(422, 'Only the reporting manager can be left empty.')
    if person.id == user.id and (fields.get('active') is False or ('role' in fields and body.role != 'admin')):
        raise HTTPException(409, 'Ask another administrator to change your own access; this prevents workspace lockout.')
    if 'manager_id' in fields:
        validate_manager(db, person.id, body.manager_id)
    if 'team_id' in fields and not db.get(Team, body.team_id):
        raise HTTPException(422, 'Team not found.')
    active_reports = db.scalar(select(Employee.id).where(Employee.manager_id == person.id, Employee.active.is_(True)).limit(1))
    if active_reports and (fields.get('active') is False or fields.get('role') == 'employee'):
        raise HTTPException(409, 'Reassign active reports before deactivating or removing management access.')
    before = {key: getattr(person, key) for key in fields}
    for key, value in fields.items():
        setattr(person, key, value)
    if fields.get('active') is False:
        revoke_employee_tokens(db, person.id)
    audit(db, user, f'Updated {person.name}: ' + '; '.join(f'{key.replace("_", " ")}: {before[key]} → {value}' for key, value in fields.items()))
    db.commit()
    return serialize_person(db, person)
