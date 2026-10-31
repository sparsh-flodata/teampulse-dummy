import os
from datetime import timedelta
from sqlalchemy import select
from backend.app.models import Team, Employee, Project, WorkItem, Commitment, Dependency, AuditEvent, now
from backend.app.core.security import hash_password
from backend.app.services.work import today, business_day

def seed(db):
    if os.getenv('SEED_DEMO', 'false').lower() != 'true' or db.scalar(select(Employee.id).limit(1)):
        return
    password = os.getenv('DEMO_PASSWORD', '')
    if len(password) < 12:
        raise RuntimeError('Set DEMO_PASSWORD to at least 12 characters before seeding.')
    db.add_all([Team(id=1, name='Engineering'), Team(id=2, name='Operations')])
    db.flush()
    people = [
        (1, 'Nitish Kumar', 'nitish@teampulse.local', 'admin', 'Engineering Lead', 1, 'Python, React, FastAPI', '#7256df', 8, True),
        (2, 'Rahul Sharma', 'rahul@teampulse.local', 'manager', 'Backend Engineer', 1, 'Python, PostgreSQL, FastAPI', '#278d88', 8, True),
        (3, 'Ananya Rao', 'ananya@teampulse.local', 'employee', 'Frontend Engineer', 1, 'React, TypeScript, UI', '#c96388', 8, True),
        (4, 'Arjun Mehta', 'arjun@teampulse.local', 'employee', 'GIS Developer', 1, 'Python, GIS, PostgreSQL', '#d58a43', 10, True),
        (5, 'Priya Nair', 'priya@teampulse.local', 'employee', 'QA Engineer', 1, 'Testing, Python, Automation', '#627fbe', 8, False),
        (6, 'Karan Shah', 'karan@teampulse.local', 'employee', 'Full Stack Engineer', 1, 'React, Python, FastAPI', '#8d75a6', 8, True),
        (7, 'Sara Khan', 'sara@teampulse.local', 'employee', 'Operations Lead', 2, 'Operations, Support', '#4b929b', 12, False),
    ]
    for id, name, email, role, title, team, skills, color, reserved, confirmed in people:
        db.add(Employee(id=id, name=name, email=email, password_hash=hash_password(password), role=role, title=title, team_id=team,
                        manager_id=(2 if id in (5, 6) else 1) if id != 1 else None, skills=skills, color=color, reserved_hours=reserved,
                        capacity_confirmed=confirmed, capacity_confirmed_on=today() if confirmed else None))
    db.flush()
    projects = [(1, 'ERP Implementation', 'A connected, dependable operating system for the business.', 1, '#7256df'),
                (2, 'GeoInsights', 'Location intelligence that makes complex data useful.', 1, '#278d88'),
                (3, 'AI Automation', 'Less repetitive work. More room for meaningful work.', 1, '#d58a43'),
                (4, 'Internal Operations', 'Keep the everyday running smoothly.', 2, '#c96388')]
    for id, name, description, team_id, color in projects:
        db.add(Project(id=id, name=name, description=description, team_id=team_id, color=color))
    db.flush()
    tasks = [
        (1, 'Employee document module', 1, 1, 'In Progress', 'High', 65, 12, 2, 'Python', False),
        (2, 'Publish the updated database schema', 1, 2, 'In Progress', 'Urgent', 80, 10, -1, 'PostgreSQL', True),
        (3, 'Property dashboard integration', 2, 3, 'Partially Blocked', 'High', 45, 18, 3, 'React', False),
        (4, 'Spatial data export pipeline', 2, 4, 'In Progress', 'Medium', 55, 20, 4, 'Python, GIS', False),
        (5, 'ERP integration test suite', 1, 5, 'Blocked', 'High', 20, 24, 4, 'Testing', False),
        (6, 'Document extraction workflow', 3, 6, 'In Progress', 'Medium', 85, 6, 1, 'Python', False),
        (7, 'Map filter components', 2, 3, 'In Progress', 'Medium', 30, 12, 5, 'React', False),
        (8, 'Review API access policies', 1, 2, 'Awaiting Verification', 'High', 100, 2, 1, 'FastAPI', False),
        (9, 'Workflow analytics dashboard', 3, None, 'Planned', 'Medium', 0, 8, 5, 'React', False),
        (10, 'Monthly operations handover', 4, 7, 'In Progress', 'Medium', 40, 16, 3, 'Operations', False),
        (11, 'Authentication service', 1, 6, 'Completed', 'High', 100, 0, 0, 'Python', False),
        (12, 'API integration contract', 1, 1, 'In Progress', 'High', 40, 16, 3, 'FastAPI', False),
    ]
    for id, title, project, owner, status, priority, progress, hours, due, skills, risk in tasks:
        due_date = business_day(today(), due) if due >= 0 else today() - timedelta(days=1)
        db.add(WorkItem(id=id, title=title, project_id=project, owner_id=owner, status=status, priority=priority,
                       progress=progress, remaining_hours=hours, required_skills=skills, risk=risk,
                       description='A pilot commitment for FloData Analytics. Update the scope and estimate as work evolves.',
                       confirmed_at=now() - timedelta(hours=2 if id != 5 else 48)))
        db.flush()
        db.add(Commitment(work_item_id=id, start_date=today() - timedelta(days=2), due_date=due_date,
                          effort_hours=max(4, hours + progress / 10), confirmed_by=owner))
        db.add(AuditEvent(actor_id=owner or 1, work_item_id=id, message=f'Confirmed the plan for “{title}”.', created_at=now() - timedelta(minutes=id * 17)))
    db.flush()
    db.add_all([
        Dependency(work_item_id=3, upstream_work_id=2, requester_id=3, owner_id=2, deliverable='Updated property database schema', reason='Needed to finish the property dashboard integration. UI work can continue.', due_date=today(), partial=True, impact='High', status='In Progress'),
        Dependency(work_item_id=12, upstream_work_id=2, requester_id=1, owner_id=2, deliverable='ERP schema contract', reason='The integration contract needs final field definitions.', due_date=today(), partial=True, impact='High', status='Accepted'),
        Dependency(work_item_id=5, upstream_work_id=12, requester_id=5, owner_id=1, deliverable='Verified API integration contract', reason='Integration tests need a stable API contract.', due_date=business_day(today(), 1), partial=False, impact='Critical', status='Requested'),
    ])
    db.get(WorkItem, 12).status = 'Partially Blocked'
    db.commit()
