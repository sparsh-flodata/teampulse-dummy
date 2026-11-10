import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from backend.app.core.config import (
    ACCESS_TOKEN_TTL_SECONDS, ALLOWED_EMAIL_DOMAINS, JWT_SECRET, REFRESH_TOKEN_TTL_DAYS,
)
from backend.app.db.session import get_db
from backend.app.models import Employee, RefreshToken, now

ISSUER = 'teampulse'
ALGORITHM = 'HS256'


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()


def verify_password(password: str, encoded: str) -> bool:
    salt, expected = encoded.split(':', 1)
    actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, expected)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def email_allowed(email: str) -> bool:
    """True when the address belongs to one of ALLOWED_EMAIL_DOMAINS (exact domain match)."""
    local, _, domain = email.strip().lower().rpartition('@')
    return bool(local) and domain in ALLOWED_EMAIL_DOMAINS


def require_allowed_email(email: str):
    if not email_allowed(email):
        allowed = ', '.join('@' + d for d in ALLOWED_EMAIL_DOMAINS)
        raise HTTPException(422, f'Only {allowed} email addresses can be registered.')


# ---- Tokens --------------------------------------------------------------------

def _access_token(user: Employee) -> str:
    issued = now()
    claims = {'sub': str(user.id), 'type': 'access', 'iss': ISSUER, 'jti': uuid.uuid4().hex,
              'iat': issued, 'exp': issued + timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS)}
    return jwt.encode(claims, JWT_SECRET, algorithm=ALGORITHM)


def issue_tokens(db: Session, user: Employee, family_id: str | None = None) -> dict:
    """A short-lived JWT access token and a rotating opaque refresh token (stored hashed)."""
    refresh = secrets.token_urlsafe(48)
    db.add(RefreshToken(token_hash=token_hash(refresh), employee_id=user.id, family_id=family_id or uuid.uuid4().hex,
                        created_at=now(), expires_at=now() + timedelta(days=REFRESH_TOKEN_TTL_DAYS)))
    return {'access_token': _access_token(user), 'refresh_token': refresh, 'token_type': 'bearer',
            'expires_in': ACCESS_TOKEN_TTL_SECONDS}


def revoke_family(db: Session, family_id: str):
    db.execute(update(RefreshToken).where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now()))


def revoke_employee_tokens(db: Session, employee_id: int):
    """Ends every session of a person (deactivation)."""
    db.execute(update(RefreshToken).where(RefreshToken.employee_id == employee_id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now()))


def rotate_refresh_token(db: Session, presented: str) -> dict:
    expired = HTTPException(401, 'Your session has expired. Please sign in again.')
    record = db.get(RefreshToken, token_hash(presented))
    if not record or record.expires_at <= now():
        raise expired
    if record.revoked_at is not None:
        # A rotated token came back: it may have been stolen. End that whole sign-in.
        revoke_family(db, record.family_id)
        db.commit()
        raise expired
    # Claim atomically so two concurrent refreshes cannot both rotate the same token.
    claimed = db.execute(update(RefreshToken).where(RefreshToken.token_hash == record.token_hash, RefreshToken.revoked_at.is_(None)).values(revoked_at=now())).rowcount
    user = db.get(Employee, record.employee_id)
    if not claimed or not user or not user.active:
        db.commit()
        raise expired
    tokens = issue_tokens(db, user, record.family_id)
    db.commit()
    return tokens


def revoke_refresh_token(db: Session, presented: str):
    record = db.get(RefreshToken, token_hash(presented))
    if record:
        revoke_family(db, record.family_id)
        db.commit()


def current_user(request: Request, db: Session = Depends(get_db)) -> Employee:
    scheme, _, token = request.headers.get('Authorization', '').partition(' ')
    if scheme.lower() != 'bearer' or not token:
        raise HTTPException(401, 'Please sign in to continue.')
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM], issuer=ISSUER,
                            options={'require': ['exp', 'sub', 'iss', 'type']})
    except jwt.PyJWTError:
        raise HTTPException(401, 'Please sign in to continue.')
    if claims.get('type') != 'access' or not str(claims['sub']).isdigit():
        raise HTTPException(401, 'Please sign in to continue.')
    user = db.get(Employee, int(claims['sub']))
    if not user or not user.active:
        raise HTTPException(401, 'This account is inactive. Please contact your workspace administrator.')
    return user


def require_manager(user: Employee):
    if user.role not in ('manager', 'admin'):
        raise HTTPException(403, 'Manager access is required.')


def find_employee_by_email(db: Session, email: str) -> Employee | None:
    return db.scalar(select(Employee).where(Employee.email == email.strip().lower()))
