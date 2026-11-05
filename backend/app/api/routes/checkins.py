"""Check-in preferences and the administrator's dry-run preview (plan section 10)."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core import config
from backend.app.core.access import require_admin
from backend.app.core.security import current_user
from backend.app.db.session import get_db
from backend.app.models import Employee
from backend.app.schemas import Preferences
from backend.app.services.proactive import org_now, preview
from backend.app.services.work import audit

router = APIRouter(prefix='/api')


def _preferences(user):
    return {'proactive_checkins': user.proactive_checkins,
            'checkins_paused_until': str(user.checkins_paused_until) if user.checkins_paused_until else None,
            'checkin_hour': config.CHECKIN_HOUR, 'org_timezone': config.ORG_TIMEZONE, 'enabled': config.PROACTIVE_ENABLED}


@router.get('/me/preferences')
def get_preferences(user: Employee = Depends(current_user)):
    return _preferences(user)


@router.patch('/me/preferences')
def update_preferences(body: Preferences, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    if body.proactive_checkins is not None:
        user.proactive_checkins = body.proactive_checkins
    if body.pause_until_tomorrow is not None:
        user.checkins_paused_until = org_now().date() + timedelta(days=1) if body.pause_until_tomorrow else None
    audit(db, user, 'Updated check-in preferences.')
    db.commit()
    return _preferences(user)


@router.get('/admin/check-ins')
def admin_check_ins(date: date | None = None, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    require_admin(user)
    day = date or org_now().date()
    return {'date': str(day), 'enabled': config.PROACTIVE_ENABLED, 'dry_run': config.PROACTIVE_DRY_RUN, 'check_ins': preview(db, day)}
