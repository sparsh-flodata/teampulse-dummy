from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee, Project, WorkItem, Dependency, AuditEvent
from backend.app.core.security import current_user
from backend.app.core.access import require_profile, directory_person
from backend.app.services.work import visible_work, serialize_work, serialize_person, serialize_dependency, downstream, health_summary

router = APIRouter(prefix="/api")

@router.get('/people/{person_id}/profile')
def person_profile(person_id: int, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    person = require_profile(db, user, person_id)
    works = list(db.scalars(select(WorkItem).join(Project).where(Project.archived.is_(False), WorkItem.owner_id == person_id).order_by(WorkItem.id.desc())))
    ids = [w.id for w in works]
    permitted_ids = {w.id for w in visible_work(db, user)}
    deps = list(db.scalars(select(Dependency).where(Dependency.work_item_id.in_(permitted_ids), (Dependency.owner_id == person_id) | (Dependency.requester_id == person_id))))
    items = [serialize_work(db, w, user) for w in works]
    events = db.scalars(select(AuditEvent).where(AuditEvent.work_item_id.in_(ids)).order_by(AuditEvent.id.desc()).limit(50))
    direct = list(db.scalars(select(Employee).where(Employee.manager_id == person_id)))
    return {'person': serialize_person(db, person), 'work': items, 'health': health_summary(items),
            'reports': [directory_person(db, user, p) for p in direct],
            'manager': directory_person(db, user, db.get(Employee, person.manager_id)) if person.manager_id else None,
            'dependencies': [serialize_dependency(d) | {'downstream_count': len(downstream(db, d.work_item_id) & permitted_ids)} for d in deps],
            'activity': [{'id': e.id, 'actor_id': e.actor_id, 'work_item_id': e.work_item_id, 'message': e.message, 'created_at': e.created_at.isoformat() + 'Z'} for e in events],
            'can_manage': user.role == 'admin'}
