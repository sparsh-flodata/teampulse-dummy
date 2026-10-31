import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models import Employee, AgentAction, Conversation
from backend.app.schemas import ChatInput, Decision
from backend.app.core.security import current_user
from backend.app.services.work import audit
from backend.app.services.assistant import converse, apply_proposal

router = APIRouter()

@router.get('/api/assistant/history')
def chat_history(user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Conversation).where(Conversation.employee_id == user.id).order_by(Conversation.id.desc()).limit(40)))[::-1]
    actions = db.scalars(select(AgentAction).where(AgentAction.employee_id == user.id).order_by(AgentAction.id.desc()).limit(20))
    return {'messages': [{'role': r.role, 'message': r.message} for r in rows], 'actions': [{'id': a.id, 'payload': json.loads(a.payload), 'status': a.status} for a in actions]}

@router.post('/api/assistant/chat')
async def chat(body: ChatInput, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    return await converse(db, user, body.message, body.work_item_id, body.request_id, body.recipient_ids)

@router.post('/api/assistant/actions/{action_id}/decide')
def decide(action_id: int, body: Decision, user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    action = db.get(AgentAction, action_id)
    if not action or action.employee_id != user.id:
        raise HTTPException(404, 'Proposal not found.')
    if action.status != 'Proposed':
        return {'status': action.status}
    claimed = db.execute(update(AgentAction).where(AgentAction.id == action.id, AgentAction.status == 'Proposed').values(status='Processing')).rowcount
    if not claimed:
        db.refresh(action)
        return {'status': action.status}
    delivered=[]
    if body.approve:
        result=apply_proposal(db, user, action)
        if json.loads(action.payload).get('kind')=='request_updates':
            from backend.app.services.coordination import serialize_request
            delivered=[serialize_request(db,r,user) for r in result]
            count=sum(r['status']=='Delivered' for r in delivered)
            text=f'{count} update request(s) delivered to TeamPulse inboxes.' if count else 'Requests are queued. No external message was sent because the selected channel is not configured.'
            db.add(Conversation(employee_id=user.id,role='assistant',message=text))
    action.status = 'Approved' if body.approve else 'Rejected'
    audit(db, user, f'{action.status} an assistant proposal.')
    db.commit()
    return {'status': action.status,'requests':delivered}
