"""Roadmaps (dummy data, see services/roadmap.py). Visible to the person and their seniors only, never to peers."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.core.access import descendants
from backend.app.core.security import current_user
from backend.app.db.session import get_db
from backend.app.models import Employee
from backend.app.services.roadmap import roadmap, summary

router = APIRouter(prefix='/api')


@router.get('/roadmaps/me')
def my_roadmap(user: Employee = Depends(current_user)):
    return roadmap(user)


@router.get('/roadmaps/team')
def team_roadmaps(user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    """Everyone below the viewer in the reporting line (direct and indirect), with how far along each roadmap is."""
    ids = descendants(db, user.id)
    if not ids:
        return []
    people = db.scalars(select(Employee).where(Employee.id.in_(ids), Employee.active.is_(True)).order_by(Employee.name))
    return [summary(p) | {'direct': p.manager_id == user.id} for p in people]


@router.get('/roadmaps/{person_id}')
def person_roadmap(person_id: int, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    if person_id != user.id and person_id not in descendants(db, user.id):
        raise HTTPException(403, 'A roadmap is visible to its owner and their seniors only.')
    person = db.get(Employee, person_id)
    if not person:
        raise HTTPException(404, 'Employee not found.')
    return roadmap(person)
