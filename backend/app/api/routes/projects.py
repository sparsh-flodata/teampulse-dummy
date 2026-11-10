from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Team, Employee, Project, ProjectMember
from backend.app.schemas import ProjectCreate
from backend.app.core.security import current_user, require_manager
from backend.app.services.work import audit
from backend.app.core.access import profile_ids
from backend.app.services.projects import project_detail

router = APIRouter()

@router.post('/api/projects', status_code=201)
def add_project(body: ProjectCreate, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    require_manager(user)
    if not db.get(Team, body.team_id):
        raise HTTPException(422, 'Team not found.')
    if user.role != 'admin' and body.team_id != user.team_id:
        raise HTTPException(403, 'Managers can create projects in their own team.')
    members = list(dict.fromkeys(body.member_ids))
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
