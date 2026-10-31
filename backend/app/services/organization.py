import os
from fastapi import HTTPException
from sqlalchemy import select
from backend.app.models import Employee, Team, Dependency, AuditEvent, Notification, DemoSetup, WorkItem, Project
from backend.app.core.access import profile_ids, descendants, directory_person
from backend.app.services.work import prefetch_work_context, visible_projects, visible_work, serialize_person, serialize_work, serialize_dependency, health_summary, downstream, today, project_member_ids

def workspace_state(db, user):
    scope = profile_ids(db, user)
    projects, works = visible_projects(db, user), visible_work(db, user)
    prefetch_work_context(db,works,scope)
    ids = {w.id for w in works}
    people = list(db.scalars(select(Employee).order_by(Employee.name)))
    directory = [directory_person(db, user, p) for p in people]
    deps = list(db.scalars(select(Dependency).where(Dependency.work_item_id.in_(ids))))
    serialized = [serialize_work(db, w, user) for w in works]
    events = db.scalars(select(AuditEvent).where((AuditEvent.work_item_id.in_(ids)) | ((AuditEvent.work_item_id.is_(None)) & (AuditEvent.actor_id == user.id))).order_by(AuditEvent.id.desc()).limit(100))
    return {'user': serialize_person(db, user), 'today': str(today()), 'demo_mode': os.getenv('SEED_COMPANY','false').lower()=='true', 'organization_source': 'org-tree.json' if db.get(DemoSetup, 'organization_checksum') else None,
        'directory': directory, 'profile_ids': sorted(scope), 'report_ids': sorted(descendants(db, user.id)) if user.role in ('manager', 'admin') else [],
        'can_manage_org': user.role == 'admin',
        'teams': [{k: getattr(t, k) for k in ('id', 'name', 'parent_id', 'lead_id')} for t in db.scalars(select(Team).where(Team.archived.is_(False)).order_by(Team.name))],
        'employees': [serialize_person(db, p) for p in people if p.id in scope],
        'projects': [{k: getattr(p, k) for k in ('id', 'name', 'description', 'team_id', 'color')} | {'member_ids': sorted(project_member_ids(db,p)), 'health': health_summary([w for w in serialized if w['project_id'] == p.id])} for p in projects],
        'work': serialized, 'health': health_summary(serialized),
        'dependencies': [serialize_dependency(d) | {'downstream_count': len(downstream(db, d.work_item_id) & ids)} for d in deps],
        'activity': [{'id': e.id, 'actor_id': e.actor_id, 'work_item_id': e.work_item_id, 'message': e.message, 'created_at': e.created_at.isoformat() + 'Z'} for e in events],
        'notifications': [{'id': n.id, 'message': n.message if n.work_item_id is None or n.work_item_id in ids else 'A previous work notification is no longer available in your current access scope.', 'work_item_id': n.work_item_id if n.work_item_id in ids else None, 'read': n.read, 'update_request_id': int(n.key.rsplit(':',1)[-1]) if n.key.startswith(('update-request:','update-response:')) and n.key.rsplit(':',1)[-1].isdigit() else None, 'created_at': n.created_at.isoformat() + 'Z'} for n in db.scalars(select(Notification).where(Notification.recipient_id == user.id, (Notification.work_item_id.is_(None)) | (Notification.work_item_id.in_(select(WorkItem.id).join(Project).where(Project.archived.is_(False))))).order_by(Notification.id.desc()).limit(100))],
        'assistant_connected': os.environ.get('AI_BASE_URL', '') != '' and all(os.getenv(k) for k in ('AI_MODEL', 'AI_API_KEY'))}

def validate_lead(db, lead_id):
    if lead_id is not None:
        lead = db.get(Employee, lead_id)
        if not lead or not lead.active or lead.role not in ('manager', 'admin'):
            raise HTTPException(422, 'Choose an active manager or administrator as team lead.')
