"""Validate and apply the user-supplied organization file as an atomic import.
A checksum prevents unchanged source from overwriting later in-app edits.
"""
import hashlib
import json
import os
from pathlib import Path
from sqlalchemy import select
from backend.app.core.config import ROOT
from backend.app.core.security import hash_password
from backend.app.models import Employee, Team, DemoSetup

DATA_PATH = ROOT / 'org-tree.json'
PACKAGED_PATH = Path(__file__).parent / 'data' / 'org-tree.json'


def read_organization(path=None):
    source = Path(path) if path else DATA_PATH if DATA_PATH.exists() else PACKAGED_PATH
    tree = json.loads(source.read_text(encoding='utf-8-sig'))
    if not isinstance(tree, list) or not tree:
        raise ValueError('org-tree.json must contain a nonempty list of organization roots.')
    rows = []
    seen = set()
    def visit(nodes, parent=None, depth=0):
        if depth > 30 or not isinstance(nodes, list):
            raise ValueError('Invalid or excessively deep organization tree.')
        for node in nodes:
            if not isinstance(node, dict) or not all(isinstance(node.get(k), str) and node[k].strip() for k in ('name', 'email', 'department')):
                raise ValueError('Each organization node needs a name, email, and department.')
            email = node['email'].strip().lower()
            if email in seen or '@' not in email or '.' not in email.split('@')[-1]:
                raise ValueError('Organization emails must be valid and unique: ' + email)
            seen.add(email)
            children = node.get('children', [])
            if not isinstance(children, list):
                raise ValueError('children must be an array for ' + email)
            rows.append({'name': node['name'].strip(), 'email': email, 'department': node['department'].strip(),
                         'manager_email': parent, 'role': 'admin' if parent is None else 'manager' if children else 'employee'})
            visit(children, email, depth+1)
    visit(tree)
    checksum = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    return rows, checksum


def import_organization(db, path=None):
    rows, checksum = read_organization(path)
    marker = db.get(DemoSetup, 'organization_checksum')
    if marker and marker.value == checksum:
        return {'changed': False, 'created_accounts': 0, 'company_accounts': len(rows)}
    people = {p.email: p for p in db.scalars(select(Employee))}
    missing = [r for r in rows if r['email'] not in people]
    password = os.getenv('DEMO_PASSWORD', '')
    if missing and len(password) < 12:
        raise RuntimeError('Set DEMO_PASSWORD to at least 12 characters before importing accounts.')
    teams = {t.name: t for t in db.scalars(select(Team))}
    for department in sorted({r['department'] for r in rows}):
        if department not in teams:
            team = Team(name=department)
            db.add(team); db.flush(); teams[department] = team
        teams[department].archived = False
        teams[department].parent_id = None
        teams[department].lead_id = None  # The file does not specify department heads.
    palette = ['#7256df', '#278d88', '#c96388', '#d58a43', '#627fbe', '#8d75a6']
    for i, row in enumerate(rows):
        person = people.get(row['email'])
        if person is None:
            person = Employee(email=row['email'], name=row['name'], password_hash=hash_password(password), team_id=teams[row['department']].id, color=palette[i % len(palette)])
            db.add(person); db.flush(); people[person.email] = person
        person.name = row['name']; person.team_id = teams[row['department']].id
        person.role = row['role']; person.active = True
        person.title = 'Organization lead' if row['role'] == 'admin' else 'Reporting manager' if row['role'] == 'manager' else row['department'] + ' team member'
    for row in rows:
        people[row['email']].manager_id = people[row['manager_email']].id if row['manager_email'] else None
    # Retire only the known original pilot identities; retain their history and passwords.
    pilot = {'nitish', 'rahul', 'ananya', 'arjun', 'priya', 'karan', 'sara'}
    for person in people.values():
        if person.email.endswith('@teampulse.local') and person.email.split('@')[0] in pilot:
            person.active = False
    db.flush()
    for team in teams.values():
        if team.name not in {r['department'] for r in rows} and not db.scalar(select(Employee.id).where(Employee.team_id == team.id, Employee.active.is_(True)).limit(1)):
            team.archived = True
    db.merge(DemoSetup(key='organization_checksum', value=checksum))
    db.info.pop('organization_people', None)
    return {'changed': True, 'created_accounts': len(missing), 'company_accounts': len(rows)}
