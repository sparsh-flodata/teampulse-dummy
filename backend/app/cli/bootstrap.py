import argparse
import getpass
from sqlalchemy import select
from backend.app.db.session import Base, engine, SessionLocal
from backend.app.models import Employee, Team
from backend.app.core.security import hash_password

parser = argparse.ArgumentParser(description='Create the first TeamPulse administrator in a fresh database.')
parser.add_argument('--email', required=True)
parser.add_argument('--name', required=True)
parser.add_argument('--team', default='Engineering')
args = parser.parse_args()
password = getpass.getpass('Administrator password (12+ characters): ')
if len(password) < 12 or '@' not in args.email:
    parser.error('Use a valid email and a password with at least 12 characters.')
Base.metadata.create_all(engine)
with SessionLocal() as db:
    if db.scalar(select(Employee.id).limit(1)):
        parser.error('Bootstrap is only available for an empty database. Use an existing manager to add teammates.')
    team = Team(name=args.team)
    db.add(team)
    db.flush()
    db.add(Employee(name=args.name, email=args.email.lower(), role='admin', title='Workspace administrator', team_id=team.id, password_hash=hash_password(password)))
    db.commit()
print('Workspace administrator created. You can now sign in.')
