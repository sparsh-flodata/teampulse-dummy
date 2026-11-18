"""FloData sign-in without the auth service: `verify` is replaced by a fake that reads test tokens.

    sso_token('rahul@teampulse.local')                       -> the FloData role matching Rahul's current TeamPulse role
    sso_token('x@flodataanalytics.com', 'teampulse:viewer')  -> exactly these roles ('' = signed in with no role here)
"""
import os

# Before the app is imported: flodata_auth reads these at import time. Fixed test values, never the real secret.
os.environ.update(FLODATA_ISSUER='https://sso.test', FLODATA_CLIENT_ID='teampulse', FLODATA_CLIENT_SECRET='test-secret',
                  FLODATA_APP_URL='http://testserver')

import pytest
from flodata_auth import User

PREFIX = 'sso|'
TIER = {'admin': 'teampulse:admin', 'manager': 'teampulse:editor', 'employee': 'teampulse:viewer'}


def sso_token(email: str, roles: str | None = None, sub: str | None = None, name: str = '') -> str:
    return PREFIX + '|'.join((sub or 'sub-' + email.lower(), email, name, '*' if roles is None else roles))


def _current_tier(email: str) -> frozenset:
    """The FloData role that keeps the person's TeamPulse role as it is in the test database."""
    from backend.app.main import app
    from backend.app.db.session import get_db
    from backend.app.core.security import find_employee_by_email
    sessions = app.dependency_overrides.get(get_db, get_db)()
    db = next(sessions)
    try:
        person = find_employee_by_email(db, email)
        return frozenset({TIER[person.role]} if person else {'teampulse:viewer'})
    finally:
        sessions.close()


def fake_verify(token: str):
    if not token.startswith(PREFIX):
        return None
    sub, email, name, roles = token[len(PREFIX):].split('|')
    granted = _current_tier(email) if roles == '*' else frozenset(r for r in roles.split(',') if r)
    return User(id=sub, email=email, name=name, department=None, roles=granted, amr=('pwd', 'mfa'), claims={'sub': sub})


@pytest.fixture(autouse=True)
def flodata_sign_in(monkeypatch):
    from backend.app.core.security import auth
    monkeypatch.setattr(auth, 'verify', fake_verify)
