"""Server-side access rules. The directory never grants operational profile access."""
from fastapi import HTTPException
from sqlalchemy import select
from backend.app.models import Employee, Team


def people_snapshot(db):
    if 'organization_people' not in db.info:
        db.info['organization_people']=list(db.scalars(select(Employee)))
    return db.info['organization_people']


def descendants(db, employee_id):
    people = people_snapshot(db)
    seen, queue = {employee_id}, [employee_id]
    while queue:
        current = queue.pop()
        for person in people:
            if person.manager_id == current and person.id not in seen:
                seen.add(person.id)
                queue.append(person.id)
    return seen - {employee_id}


def profile_ids(db, user):
    if user.role == 'admin':
        return {p.id for p in people_snapshot(db)}
    return {user.id} | (descendants(db, user.id) if user.role == 'manager' else set())


def can_manage_person(db, user, employee_id):
    return user.role == 'admin' or (user.role == 'manager' and employee_id in descendants(db, user.id))


def require_profile(db, user, employee_id):
    if employee_id not in profile_ids(db, user):
        raise HTTPException(403, 'Full work profiles are limited to yourself and your reporting team.')
    person = db.get(Employee, employee_id)
    if not person:
        raise HTTPException(404, 'Employee not found.')
    return person


def require_admin(user):
    if user.role != 'admin':
        raise HTTPException(403, 'Workspace administrator access is required.')


def validate_manager(db, person_id, manager_id):
    if manager_id is None:
        return
    parent = db.get(Employee, manager_id)
    if not parent or not parent.active or parent.role not in ('manager', 'admin'):
        raise HTTPException(422, 'Choose an active manager or workspace administrator.')
    if manager_id == person_id or manager_id in descendants(db, person_id):
        raise HTTPException(409, 'This change would create a circular reporting relationship.')


def validate_team_parent(db, team_id, parent_id):
    seen = {team_id} if team_id else set()
    while parent_id is not None:
        if parent_id in seen:
            raise HTTPException(409, 'This change would create a circular team structure.')
        seen.add(parent_id)
        team = db.get(Team, parent_id)
        if not team:
            raise HTTPException(422, 'Parent team not found.')
        parent_id = team.parent_id


def directory_person(db, user, person):
    return {key: getattr(person, key) for key in ('id', 'name', 'title', 'role', 'team_id', 'manager_id', 'color', 'active')} | {
        'can_view_profile': person.id in profile_ids(db, user),
        'direct_reports': sum(1 for p in people_snapshot(db) if p.manager_id==person.id and p.active)
    }
