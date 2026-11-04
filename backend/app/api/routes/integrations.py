"""Google Chat app endpoint and per-person connection status.

Google Chat calls POST /api/integrations/google-chat/events for every interaction.
Supports the classic Chat app event format and the Workspace add-on format.
Private work is only discussed in direct messages, never in shared spaces.
"""
import hashlib
import json
import logging
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.channels import google_chat
from backend.app.core.config import app_link
from backend.app.core.security import current_user, email_allowed, find_employee_by_email
from backend.app.db.session import get_db
from backend.app.models import ChatLink, Employee, MessageReceipt, UpdateRequest
from backend.app.schemas import UpdateReply
from backend.app.services.assistant import converse
from backend.app.services.coordination import reply_to_request

router = APIRouter()
log = logging.getLogger('teampulse.google_chat')

HELP = ('Hi, I’m TeamPulse. Tell me how your work is going in your own words, for example '
        '“the Atlas review is 60% done, 4 hours left”. When someone asks you for an update, '
        'your next message here answers them.')


def _normalize(event: dict) -> tuple[str, dict, dict, dict, bool]:
    """(type, user, space, message, addon) for both event formats."""
    if 'chat' in event:  # Workspace add-on
        chat = event['chat']
        user = chat.get('user', {})
        if 'messagePayload' in chat:
            p = chat['messagePayload']
            return 'MESSAGE', user, p.get('space', {}), p.get('message', {}), True
        if 'addedToSpacePayload' in chat:
            return 'ADDED_TO_SPACE', user, chat['addedToSpacePayload'].get('space', {}), {}, True
        if 'removedFromSpacePayload' in chat:
            return 'REMOVED_FROM_SPACE', user, chat['removedFromSpacePayload'].get('space', {}), {}, True
        return 'OTHER', user, {}, {}, True
    return event.get('type', 'OTHER'), event.get('user', {}), event.get('space', {}), event.get('message', {}), False


def _reply(text: str | None, addon: bool) -> dict:
    if text is None:
        return {}
    if addon:
        return {'hostAppDataAction': {'chatDataAction': {'createMessageAction': {'message': {'text': text}}}}}
    return {'text': text}


def _employee(db: Session, user: dict) -> Employee | None:
    email = (user.get('email') or '').strip().lower()
    if not email or not email_allowed(email):
        return None
    person = find_employee_by_email(db, email)
    return person if person and person.active else None


def _not_registered(user: dict) -> str:
    email = user.get('email') or 'this Google account'
    where = f' at {app_link("/login")}' if app_link('/login') else ''
    return (f'I couldn’t find an active TeamPulse account for {email}. '
            f'Register with your work email{where}, then message me again.')


@router.post('/api/integrations/google-chat/events', include_in_schema=False)
async def google_chat_events(request: Request, db: Session = Depends(get_db)):
    if not google_chat.inbound_enabled():
        raise HTTPException(404, 'Google Chat is not configured.')
    try:
        google_chat.verify_event(request.headers.get('Authorization', ''))
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise HTTPException(401, 'Invalid Google Chat token.')
    try:
        event = await request.json()
    except ValueError:
        raise HTTPException(400, 'Invalid event.')
    kind, user, space, message, addon = _normalize(event)
    google_user, space_name = user.get('name', ''), space.get('name', '')
    dm = google_chat.is_direct_message(space)

    if kind == 'REMOVED_FROM_SPACE':
        if dm and google_user:
            google_chat.unlink(db, google_user)
            db.commit()
        return {}
    if kind not in ('ADDED_TO_SPACE', 'MESSAGE'):
        return {}
    if not dm:
        return _reply('Message me directly to share updates. I keep everyone’s work private, so I don’t discuss it in shared spaces.', addon)
    employee = _employee(db, user)
    if not employee:
        return _reply(_not_registered(user), addon)
    if google_user and space_name:
        google_chat.link_employee(db, employee, google_user, space_name)
        db.commit()
    if kind == 'ADDED_TO_SPACE':
        return _reply(f'Connected to TeamPulse as {employee.name}. ' + HELP, addon)

    text = (message.get('argumentText') or message.get('text') or '').strip()
    if not text:
        return _reply(HELP, addon)
    if text.lower() in ('help', 'hi', 'hello', 'start'):
        return _reply(HELP, addon)

    # Google retries deliveries; the message name makes each one count once.
    request_id = ('gchat:' + (message.get('name') or hashlib.sha256(text.encode()).hexdigest()))[:120]
    fingerprint = hashlib.sha256(text.encode()).hexdigest()
    receipt = db.scalar(select(MessageReceipt).where(MessageReceipt.employee_id == employee.id, MessageReceipt.request_id == request_id))
    if receipt:
        return _reply(json.loads(receipt.response_json).get('reply', ''), addon)

    pending = db.scalar(select(UpdateRequest).where(UpdateRequest.recipient_id == employee.id, UpdateRequest.channel == 'google_chat',
                                                    UpdateRequest.status == 'Delivered').order_by(UpdateRequest.id))
    if pending and len(text) >= 3:
        try:
            reply_to_request(db, employee, pending, UpdateReply(message=text))
            sender = db.get(Employee, pending.requester_id)
            answer = f'Thanks. I sent your update to {sender.name if sender else "the requester"}.'
        except HTTPException as exc:
            db.rollback()
            answer = f'I couldn’t send that as a reply: {exc.detail} Answer it in TeamPulse, AI chat, instead.'
        db.add(MessageReceipt(employee_id=employee.id, request_id=request_id, fingerprint=fingerprint, response_json=json.dumps({'reply': answer})))
        db.commit()
        return _reply(answer, addon)

    try:
        result = await converse(db, employee, text[:4000], None, request_id)
    except HTTPException as exc:
        db.rollback()
        return _reply(f'{exc.detail}', addon)
    answer = result.get('reply', '')
    action = result.get('action')
    if action and action.get('status') == 'Proposed':
        link = app_link('/chat')
        answer += '\n\nThis is only a draft. Open TeamPulse, AI chat, to review and confirm it' + (f': {link}' if link else '.')
    return _reply(answer, addon)


@router.get('/api/integrations/google-chat')
def google_chat_status(user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    link = db.get(ChatLink, user.id)
    return google_chat.status() | {'connected': bool(link), 'connected_at': link.linked_at.isoformat() + 'Z' if link else None}


@router.post('/api/integrations/google-chat/disconnect')
def google_chat_disconnect(user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    link = db.get(ChatLink, user.id)
    if link:
        db.delete(link)
        db.commit()
    return google_chat.status() | {'connected': False, 'connected_at': None}
