from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee, Notification
from backend.app.core.security import current_user

router = APIRouter()

@router.post('/api/notifications/{notification_id}/read')
def mark_read(notification_id: int, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    notification = db.get(Notification, notification_id)
    if not notification or notification.recipient_id != user.id:
        raise HTTPException(404, 'Notification not found.')
    notification.read = True
    db.commit()
    return {'ok': True}
