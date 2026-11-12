from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Team, Employee, Project, ProjectMember
from backend.app.schemas import ProjectCreate
from backend.app.core.security import current_user, require_manager
from backend.app.services.work import audit
from backend.app.core.access import profile_ids
from pydantic import BaseModel
from backend.app.services.projects import add_project_member, can_manage_members, project_detail, remove_project_member
from backend.app.services.work import visible_projects

router = APIRouter()

@router.post('/api/projects', status_code=201)
def add_project(body: ProjectCreate, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    require_manager(user)
    if not db.get(Team, body.team_id):
        raise HTTPException(422, 'Team not found.')
    if user.role != 'admin' and body.team_id != user.team_id:
        raise HTTPException(403, 'Managers can create projects in their own team.')
    # The creator is on the project, so they can see it (department alone grants nothing).
    members = list(dict.fromkeys([user.id, *body.member_ids]))
    allowed = profile_ids(db, user)
    for person_id in members:
        person = db.get(Employee, person_id)
        if not person or not person.active:
            raise HTTPException(422, 'Choose active project participants.')
        if person_id not in allowed:
            raise HTTPException(403, 'Managers can invite only their reporting team; administrators can invite across the organization.')
    project = Project(**body.model_dump(exclude={'member_ids'}))
    db.add(project)
    db.flush()
    db.add_all([ProjectMember(project_id=project.id, employee_id=person_id) for person_id in members])
    audit(db, user, f'Created project “{body.name}”.')
    db.commit()
    return {'id': project.id}


@router.get('/api/projects/{project_id}')
def project_overview(project_id: int, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    return project_detail(db, user, project_id)


class MemberInput(BaseModel):
    employee_id: int


def _project(db, user, project_id):
    project = next((p for p in visible_projects(db, user) if p.id == project_id), None)
    if not project:
        raise HTTPException(404, 'Project not found.')
    return project


@router.post('/api/projects/{project_id}/members', status_code=201)
def add_member(project_id: int, body: MemberInput, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    project = _project(db, user, project_id)
    if not can_manage_members(db, user, project):
        raise HTTPException(403, 'Administrators and managers on the project add people to it.')
    add_project_member(db, user, db.get(Employee, body.employee_id), project)
    db.commit()
    return project_detail(db, user, project_id)


@router.delete('/api/projects/{project_id}/members/{employee_id}')
def remove_member(project_id: int, employee_id: int, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    """Remove someone (administrators and managers on the project), or leave (anyone, for themselves)."""
    project = _project(db, user, project_id)
    if employee_id != user.id and not can_manage_members(db, user, project):
        raise HTTPException(403, 'Administrators and managers on the project remove people from it.')
    person = db.get(Employee, employee_id)
    if not person:
        raise HTTPException(404, 'Employee not found.')
    remove_project_member(db, user, person, project)
    db.commit()
    return {'left': employee_id == user.id}
