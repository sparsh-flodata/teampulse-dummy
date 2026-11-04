"""JWT auth: short-lived access tokens, rotating refresh tokens.

POST /api/auth/login     {email, password}          -> {access_token, refresh_token, expires_in, user}
POST /api/auth/register  {name, email, password}    -> same as login (allowed email domains only)
POST /api/auth/refresh   {refresh_token}            -> {access_token, refresh_token, expires_in}
POST /api/auth/logout    {refresh_token}            -> {ok: true}
GET  /api/auth/me        Authorization: Bearer ...  -> Person
"""
import time
from collections import defaultdict, deque
from threading import Lock
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.core.config import REGISTRATION_TEAM
from backend.app.db.session import get_db
from backend.app.models import Employee, Team
from backend.app.schemas import Login, Register, RefreshInput
from backend.app.core.security import (
    current_user, find_employee_by_email, hash_password, issue_tokens, require_allowed_email,
    revoke_refresh_token, rotate_refresh_token, verify_password,
)
from backend.app.services.work import audit, serialize_person

router = APIRouter()

attempts = defaultdict(deque)
login_lock = Lock()
DUMMY_HASH = hash_password('not-a-real-account-password')
PERSON_COLORS = ('#5b6f8f', '#4f7a78', '#8a6a3f', '#8f5560', '#6c5b8a', '#4f7a5c')


def throttle(request: Request, limit: int = 10):
    key = request.client.host if request.client else 'unknown'
    with login_lock:
        entries = attempts[key]
        while entries and time.monotonic() - entries[0] > 60:
            entries.popleft()
        if len(entries) >= limit:
            raise HTTPException(429, 'Too many attempts. Try again in a minute.')
        entries.append(time.monotonic())


@router.post('/api/auth/login')
def login(body: Login, request: Request, db: Session = Depends(get_db)):
    throttle(request)
    user = find_employee_by_email(db, body.email)
    valid = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid or not user.active:
        raise HTTPException(401, 'Email or password is incorrect.')
    tokens = issue_tokens(db, user)
    db.commit()
    return tokens | {'user': serialize_person(db, user)}


@router.post('/api/auth/register', status_code=201)
def register(body: Register, request: Request, db: Session = Depends(get_db)):
    throttle(request)
    require_allowed_email(body.email)
    if find_employee_by_email(db, body.email):
        raise HTTPException(409, 'An account with this email already exists. Sign in instead.')
    team = (db.scalar(select(Team).where(Team.name == REGISTRATION_TEAM, Team.archived.is_(False))) if REGISTRATION_TEAM else None) \
        or db.scalar(select(Team).where(Team.archived.is_(False)).order_by(Team.parent_id.is_not(None), Team.id))
    if not team:
        raise HTTPException(503, 'This workspace is not set up yet. Ask an administrator to create a team first.')
    count = db.scalar(select(Employee.id).order_by(Employee.id.desc())) or 0
    user = Employee(name=body.name.strip(), email=body.email, password_hash=hash_password(body.password), role='employee',
                    team_id=team.id, manager_id=None, color=PERSON_COLORS[count % len(PERSON_COLORS)])
    db.add(user)
    db.flush()
    audit(db, user, f'{user.name} registered with {user.email}.')
    tokens = issue_tokens(db, user)
    db.commit()
    return tokens | {'user': serialize_person(db, user)}


@router.post('/api/auth/refresh')
def refresh(body: RefreshInput, db: Session = Depends(get_db)):
    return rotate_refresh_token(db, body.refresh_token)


@router.post('/api/auth/logout')
def logout(body: RefreshInput, db: Session = Depends(get_db)):
    revoke_refresh_token(db, body.refresh_token)
    return {'ok': True}


@router.get('/api/auth/me')
def me(user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    return serialize_person(db, user)
