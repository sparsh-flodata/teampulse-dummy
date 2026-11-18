import argparse
from sqlalchemy import select
from backend.app.db.session import Base, engine, SessionLocal
from backend.app.models import Employee, Team

parser = argparse.ArgumentParser(description='Create the first team and TeamPulse administrator in a fresh database. '
                                 'They sign in through FloData; give them teampulse:admin in the FloData Auth console.')
parser.add_argument('--email', required=True)
parser.add_argument('--name', required=True)
parser.add_argument('--team', default='Engineering')
args = parser.parse_args()
if '@' not in args.email:
    parser.error('Use a valid email.')
Base.metadata.create_all(engine)
with SessionLocal() as db:
    if db.scalar(select(Employee.id).limit(1)):
        parser.error('Bootstrap is only available for an empty database. Use an existing manager to add teammates.')
    team = Team(name=args.team)
    db.add(team)
    db.flush()
    db.add(Employee(name=args.name, email=args.email.lower(), role='admin', title='Workspace administrator', team_id=team.id, password_hash=''))
    db.commit()
print('Workspace administrator created. They can now sign in through FloData.')
