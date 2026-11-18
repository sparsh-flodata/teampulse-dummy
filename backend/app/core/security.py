"""Sign-in is FloData single sign-on (flodata_auth). TeamPulse keeps its own authorization.

FloData decides who may use TeamPulse and at which tier (teampulse:admin / editor / viewer). Each request maps
that tier onto TeamPulse's role (admin / manager / employee), which every permission check here relies on.
"""
import hashlib
import secrets
from fastapi import Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from flodata_auth import FloDataAuth, User
from backend.app.core.config import ALLOWED_EMAIL_DOMAINS, REGISTRATION_TEAM
from backend.app.db.session import get_db
from backend.app.models import Employee, Team

ADMIN, EDITOR, VIEWER = 'teampulse:admin', 'teampulse:editor', 'teampulse:viewer'
# Strict by tier, most powerful first: the role is overwritten from FloData on every request.
TOOL_ROLES = ((ADMIN, 'admin'), (EDITOR, 'manager'), (VIEWER, 'employee'))
PERSON_COLORS = ('#5b6f8f', '#4f7a78', '#8a6a3f', '#8f5560', '#6c5b8a', '#4f7a5c')


def _build_auth() -> FloDataAuth:
    try:
        return FloDataAuth.from_env()  # FLODATA_ISSUER, FLODATA_CLIENT_ID, FLODATA_CLIENT_SECRET, FLODATA_APP_URL
    except KeyError as missing:
        raise RuntimeError(f'{missing.args[0]} is not set. Add the FLODATA_* settings to .env (see .env.example).') from None


auth = _build_auth()


def hash_password(password: str) -> str:
    """Seeds and old rows only: FloData staff never sign in with a TeamPulse password."""
    salt = secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()


def email_allowed(email: str) -> bool:
    """True when the address belongs to one of ALLOWED_EMAIL_DOMAINS (exact domain match)."""
    local, _, domain = email.strip().lower().rpartition('@')
    return bool(local) and domain in ALLOWED_EMAIL_DOMAINS


def require_allowed_email(email: str):
    if not email_allowed(email):
        allowed = ', '.join('@' + d for d in ALLOWED_EMAIL_DOMAINS)
        raise HTTPException(422, f'Only {allowed} email addresses can be added.')


def tool_role(sso: User) -> str | None:
    """TeamPulse role for the FloData roles in the token (the most powerful one wins)."""
    return next((role for flodata, role in TOOL_ROLES if flodata in sso.roles), None)


def _default_team(db: Session) -> Team:
    team = (db.scalar(select(Team).where(Team.name == REGISTRATION_TEAM, Team.archived.is_(False))) if REGISTRATION_TEAM else None) \
        or db.scalar(select(Team).where(Team.archived.is_(False)).order_by(Team.parent_id.is_not(None), Team.id))
    if not team:
        raise HTTPException(503, 'This workspace is not set up yet. Ask an administrator to create a team first.')
    return team


def _linked(db: Session, sso: User, email: str) -> Employee | None:
    """The person for this FloData account: by FloData id, else by email the first time (then linked)."""
    person = db.scalar(select(Employee).where(Employee.flodata_sub == sso.id))
    if person is None and email:
        person = db.scalar(select(Employee).where(func.lower(Employee.email) == email))
        if person is not None and person.flodata_sub is not None:
            raise HTTPException(409, 'This email is linked to another FloData account. Ask an administrator.')
    return person


def sync_employee(db: Session, sso: User, role: str) -> Employee:
    """Finds (or on first sign-in creates) the person and keeps email, name and role in step with FloData."""
    from backend.app.services.work import audit  # services import this module
    email = sso.email.strip().lower()
    person = _linked(db, sso, email)
    if person is None:
        if not email:
            raise HTTPException(403, 'Your FloData account has no email address. Ask an administrator.')
        count = db.scalar(select(func.count(Employee.id))) or 0
        person = Employee(name=(sso.name or email.split('@')[0])[:120], email=email, password_hash='', role=role,
                          team_id=_default_team(db).id, manager_id=None, flodata_sub=sso.id,
                          color=PERSON_COLORS[count % len(PERSON_COLORS)])
        db.add(person)
        try:
            db.flush()
        except IntegrityError:  # a parallel first request created them a moment ago
            db.rollback()
            person = _linked(db, sso, email)
            if person is None:
                raise
        else:
            audit(db, person, f'{person.name} joined TeamPulse through FloData sign-in.')
            db.commit()
            return person
    wanted = {'flodata_sub': sso.id, 'role': role}
    if email:
        wanted['email'] = email
    if sso.name:
        wanted['name'] = sso.name[:120]
    changed = {key: value for key, value in wanted.items() if getattr(person, key) != value}
    if changed:
        if 'role' in changed:
            audit(db, person, f'{person.name}\'s role set to {role} from FloData Auth (was {person.role}).')
        for key, value in changed.items():
            setattr(person, key, value)
        db.commit()
    return person


def current_user(sso: User = Depends(auth.user), db: Session = Depends(get_db)) -> Employee:
    """Signed in through FloData with a TeamPulse role, and active in TeamPulse."""
    role = tool_role(sso)
    if role is None:
        raise HTTPException(403, "You don't have access to this tool")
    person = sync_employee(db, sso, role)
    if not person.active:
        raise HTTPException(403, 'This account is inactive in TeamPulse. Please contact your workspace administrator.')
    return person


def require_manager(user: Employee):
    if user.role not in ('manager', 'admin'):
        raise HTTPException(403, 'Manager access is required.')


def find_employee_by_email(db: Session, email: str) -> Employee | None:
    return db.scalar(select(Employee).where(Employee.email == email.strip().lower()))
