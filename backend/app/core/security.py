import hashlib
import hmac
import secrets
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import AuthSession, Employee, now

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()

def verify_password(password: str, encoded: str) -> bool:
    salt, expected = encoded.split(':', 1)
    actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, expected)

def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def current_user(request: Request, db: Session = Depends(get_db)) -> Employee:
    session = db.get(AuthSession, token_hash(request.cookies.get('teampulse_session', '')))
    if not session or session.expires_at <= now():
        raise HTTPException(401, 'Please sign in to continue.')
    user = db.get(Employee, session.employee_id)
    if not user or not user.active:
        raise HTTPException(401, 'This account is inactive. Please contact your workspace administrator.')
    return user

def require_manager(user: Employee):
    if user.role not in ('manager', 'admin'):
        raise HTTPException(403, 'Manager access is required.')
