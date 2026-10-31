from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee
from backend.app.core.security import current_user
from backend.app.services.organization import workspace_state

router = APIRouter()

@router.get('/api/health')
def health():
    return {'status': 'ok', 'version': '0.3.0'}

@router.get('/api/state')
def state(user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    return workspace_state(db, user)
