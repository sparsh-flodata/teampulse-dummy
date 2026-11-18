"""Who is signed in. Sign-in itself is FloData single sign-on: /auth/login, /auth/callback and /auth/logout
come from flodata_auth (installed in main.py), and the tokens live in httpOnly cookies.

GET /api/auth/me  -> Person + {roles, mfa, account_url}
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from flodata_auth import User
from backend.app.db.session import get_db
from backend.app.models import Employee
from backend.app.core.security import auth, current_user
from backend.app.services.work import serialize_person

router = APIRouter()


@router.get('/api/auth/me')
def me(user: Employee = Depends(current_user), sso: User = Depends(auth.user), db: Session = Depends(get_db)):
    return serialize_person(db, user) | {'roles': sorted(sso.roles), 'mfa': sso.mfa, 'account_url': auth.account_url,
                                         'logout_url': f'{auth.prefix}/logout'}
