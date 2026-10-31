import os
import secrets
import time
from collections import defaultdict, deque
from threading import Lock
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee, AuthSession, now
from backend.app.schemas import Login
from backend.app.core.security import current_user, hash_password, verify_password, token_hash
from backend.app.services.work import serialize_person

router = APIRouter()

attempts = defaultdict(deque)
login_lock = Lock()
DUMMY_HASH = hash_password('not-a-real-account-password')

@router.post('/api/auth/login')
def login(body: Login, request: Request, response: Response, db: Session = Depends(get_db)):
    key = request.client.host if request.client else 'unknown'
    with login_lock:
        entries = attempts[key]
        while entries and time.monotonic() - entries[0] > 60:
            entries.popleft()
        if len(entries) >= 10:
            raise HTTPException(429, 'Too many sign-in attempts. Try again in a minute.')
        entries.append(time.monotonic())
    user = db.scalar(select(Employee).where(Employee.email == body.email.lower()))
    valid = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid or not user.active:
        raise HTTPException(401, 'Email or password is incorrect.')
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=token_hash(token), employee_id=user.id, expires_at=now() + timedelta(days=7)))
    db.commit()
    response.set_cookie('teampulse_session', token, httponly=True, samesite='strict', secure=os.getenv('COOKIE_SECURE', 'false').lower() == 'true', max_age=604800)
    return serialize_person(db, user)

@router.post('/api/auth/logout')
def logout(request: Request, response: Response, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    record = db.get(AuthSession, token_hash(request.cookies.get('teampulse_session', '')))
    if record:
        db.delete(record)
        db.commit()
    response.delete_cookie('teampulse_session')
    return {'ok': True}
