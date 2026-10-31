import json
import hashlib
import uuid
import os
import re
from datetime import date
from typing import Literal
import httpx
from pydantic import BaseModel, Field, ConfigDict, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from backend.app.models import Conversation, AgentAction, MessageReceipt, WorkItem
from backend.app.schemas import WorkCreate, WorkPatch
from backend.app.services.coordination import coordination_intent,create_requests,validate_recipients,allowed_recipients
from backend.app.services.work import today, business_day, serialize_work, visible_projects, visible_work, create_work, patch_work, get_work

class Proposal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['create', 'update', 'request_updates']
    recipient_ids: list[int] = Field(default_factory=list,max_length=100)
    request_prompt: str = Field(default='Please share your progress, expected completion, and blockers.',max_length=2000)
    channel: Literal['in_app','whatsapp'] = 'in_app'
    work_item_id: int | None = None
    title: str | None = Field(default=None, min_length=3, max_length=200)
    project_id: int | None = None
    due_date: date | None = None
    effort_hours: float | None = Field(default=None, gt=0, le=1000)
    status: Literal['Planned', 'In Progress', 'Awaiting Verification', 'Completed'] | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    remaining_hours: float | None = Field(default=None, ge=0, le=1000)
    note: str = Field(default='', max_length=4000)

class Interpretation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    reply: str = Field(min_length=1, max_length=4000)
    proposal: Proposal | None = None

async def provider_interpret(message, context, history):
    base, model, key = (os.getenv(k, '') for k in ('AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY'))
    if not all((base, model, key)):
        return None
    system = ('You are TeamPulse, a transparent work coordination assistant. Respond with ONLY JSON matching this schema: '
              + json.dumps(Interpretation.model_json_schema()) + '\nUse only IDs from the supplied context. '
              'Ask one concise clarification if an update is ambiguous. Never infer completion, capacity, dates, or dependencies from silence. '
              'Never create duplicate tasks. Propose updates to existing work. Never claim to have saved a proposal. '
              'Only change the current user\'s own work. You may propose request_updates only for IDs in requestable_people, and never claim delivery before confirmation. Do not assign others, change priorities or automatically resolve dependencies. '
              'For revised dates, ask for a reason if missing. Facts: ' + json.dumps(context))
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(base.rstrip('/') + '/chat/completions', headers={'Authorization': 'Bearer ' + key},
            json={'model': model, 'messages': [{'role': 'system', 'content': system}] + history + [{'role': 'user', 'content': message}],
                  'response_format': {'type': 'json_object'}})
        response.raise_for_status()
        return Interpretation.model_validate_json(response.json()['choices'][0]['message']['content'])

def offline_interpret(message, works, projects, selected):
    text = message.lower()
    if selected:
        ambiguous_completion = bool(re.search(r'\b(not|almost|nearly|haven.t|isn.t|not yet)\b.*\b(finished|completed|done)\b', text))
        if ambiguous_completion:
            return Interpretation(reply='I will not mark this complete. What remains, and how many hours do you expect it to need? You can share a progress percentage and remaining hours.')
        complete = bool(re.search(r'\b(finished|completed|done)\b', text))
        percent = re.search(r'\b(\d{1,3})\s*%', text)
        hours = re.search(r'\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:left|remaining)', text)
        deadline = re.search(r'\b(\d{4}-\d{2}-\d{2})\b', text)
        if any((complete, percent, hours, deadline)):
            try:
                proposal = Proposal(kind='update', work_item_id=selected.id, status='Completed' if complete else None,
                    progress=int(percent[1]) if percent else None, remaining_hours=float(hours[1]) if hours else None,
                    due_date=date.fromisoformat(deadline[1]) if deadline else None, note=message)
                return Interpretation(reply='Here is the proposed update. Review it before saving; your existing commitment and history will be preserved.', proposal=proposal)
            except (ValueError, ValidationError):
                return Interpretation(reply='Please use a valid YYYY-MM-DD date and progress between 0% and 100%.')
        if any(x in text for x in ('block', 'waiting')):
            return Interpretation(reply='To record this accurately, open the work item and select “Add dependency”. Name the deliverable, owner, and expected date, and indicate whether other work can continue. I have not changed its status.')
    if text.startswith('plan:'):
        title = message.split(':', 1)[1].split(';', 1)[0].strip()
        hour = re.search(r'\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b', text)
        due = re.search(r'\b(\d{4}-\d{2}-\d{2})\b', text)
        matched = [p for p in projects if p.name.lower() in text]
        if len(matched) != 1 or not hour or not due:
            return Interpretation(reply='Use: Plan: [deliverable]; [effort] hours; due YYYY-MM-DD; project [project name]. Effort and expected completion are separate. Or use “New commitment” for a guided form.')
        if any(w.title.casefold() == title.casefold() for w in works):
            return Interpretation(reply='That work already exists. Select it in the context menu to update the commitment instead of creating a duplicate.')
        try:
            p = Proposal(kind='create', title=title, project_id=matched[0].id, effort_hours=float(hour[1]), due_date=date.fromisoformat(due[1]), note=message)
            return Interpretation(reply='I have drafted this commitment for you. Review the scope, effort, and completion date before confirming.', proposal=p)
        except (ValueError, ValidationError):
            return Interpretation(reply='Please check the effort and date. Use a valid YYYY-MM-DD date and positive hours.')
    active = [w for w in works if w.status != 'Completed']
    if any(word in text for word in ('summar', 'priorit', 'week', 'today', 'commitment')):
        lines = [f'• {w.title}: {w.status}, {w.remaining_hours:g}h remaining.' for w in sorted(active, key=lambda w: {'Urgent': 0, 'High': 1, 'Medium': 2, 'Low': 3}[w.priority])[:6]]
        return Interpretation(reply=('Your current commitments:\n' + '\n'.join(lines) if lines else 'You have no recorded active commitments. Confirm your availability in Settings before taking on more work.') + '\n\nCapacity and dates are estimates until confirmed. Open a work item to review its dependencies.')
    return Interpretation(reply='I can summarize your week, draft a commitment, or update selected work. In offline mode, try “Summarize my commitments”, select a work item and say “65% complete, 4 hours remaining”, or use “Plan: Build report; 4 hours; due ' + str(business_day(today(), 1)) + '; project ' + (projects[0].name if projects else '[name]') + '”.')

def snapshot(db, work):
    value = serialize_work(db, work)
    return {key: value[key] for key in ('status', 'progress', 'remaining_hours', 'revision', 'confirmed_at')}


def receipt_response(db, receipt, fingerprint):
    if receipt.fingerprint != fingerprint:
        raise HTTPException(409, 'This message identifier was already used for different content.')
    response = json.loads(receipt.response_json)
    if response.get('action'):
        action = db.get(AgentAction, response['action']['id'])
        response['action']['status'] = action.status if action else response['action']['status']
    return response | {'duplicate': True}


async def converse(db, user, message, work_id, request_id=None, recipient_ids=None):
    # This authenticated, channel-independent service is the future adapter boundary.
    request_id = request_id or str(uuid.uuid4())
    fingerprint = hashlib.sha256(json.dumps([message, work_id, sorted(recipient_ids or [])]).encode()).hexdigest()
    receipt = db.scalar(select(MessageReceipt).where(MessageReceipt.employee_id == user.id, MessageReceipt.request_id == request_id))
    if receipt:
        return receipt_response(db, receipt, fingerprint)

    works = [w for w in visible_work(db, user) if w.owner_id == user.id]
    projects = visible_projects(db, user)
    selected = next((w for w in works if w.id == work_id), None)
    if work_id and selected is None:
        raise HTTPException(403, 'Select one of your own work items.')
    history_rows = list(db.scalars(select(Conversation).where(Conversation.employee_id == user.id).order_by(Conversation.id.desc()).limit(12)))[::-1]
    history = [{'role': r.role, 'content': r.message} for r in history_rows]
    context = {'today': str(today()), 'selected_work_item_id': work_id, 'work': [serialize_work(db, w) for w in works],
               'projects': [{'id': p.id, 'name': p.name} for p in projects], 'requestable_people':[{'id':p.id,'name':p.name,'title':p.title} for p in allowed_recipients(db,user)]}
    mode = 'offline'
    coordinated = coordination_intent(db,user,message,recipient_ids)
    try:
        result = Interpretation.model_validate(coordinated) if coordinated else await provider_interpret(message, context, history)
        if result and not coordinated:
            mode = 'connected'
        elif not result:
            result = offline_interpret(message, works, projects, selected)
    except (httpx.HTTPError, ValueError, KeyError, IndexError, ValidationError):
        result = offline_interpret(message, works, projects, selected)
        result.reply = 'The AI provider is unavailable. Using offline planning.\n\n' + result.reply
    action = None
    if result.proposal:
        p = result.proposal
        if p.kind == 'request_updates':
            validate_recipients(db,user,p.recipient_ids)
        elif p.kind == 'update':
            target = get_work(db, user, p.work_item_id or 0, edit=True)
            if target.owner_id != user.id:
                raise HTTPException(403, 'The assistant can only propose updates to your own work.')
        elif not all((p.title, p.project_id, p.due_date, p.effort_hours)) or p.project_id not in [p.id for p in projects]:
            result = Interpretation(reply='I need a project, deliverable, estimated hours, and expected completion date to draft a commitment.')
        elif any(w.title.casefold() == p.title.casefold() for w in works):
            result = Interpretation(reply='A commitment with that title already exists. Select it to update existing work.')
        if result.proposal:
            base = snapshot(db, db.get(WorkItem, p.work_item_id)) if p.kind == 'update' else {}
            action = AgentAction(employee_id=user.id, payload=p.model_dump_json(), base_snapshot=json.dumps(base))
            db.add(action)
            db.flush()
    auto_applied = False
    if action and selected and user.agent_auto_updates and result.proposal.kind == 'update':
        proposal = result.proposal
        deterministic = offline_interpret(message, works, projects, selected).proposal
        # Only exact, explicit percentage/remaining-hour updates can auto-apply.
        routine = proposal.status is None and proposal.due_date is None and (proposal.progress is not None or proposal.remaining_hours is not None)
        if routine and deterministic and deterministic.model_dump() == proposal.model_dump():
            apply_proposal(db, user, action)
            action.status = 'Applied'
            auto_applied = True
            result.reply = 'Saved your explicit progress update using your automatic-update preference. Completion, new commitments, and delivery-date changes still require confirmation.'
    db.add_all([Conversation(employee_id=user.id, role='user', message=message), Conversation(employee_id=user.id, role='assistant', message=result.reply)])
    response = {'reply': result.reply, 'mode': mode, 'auto_applied': auto_applied, 'action': {'id': action.id, 'payload': json.loads(action.payload), 'status': action.status} if action else None}
    db.add(MessageReceipt(employee_id=user.id, request_id=request_id, fingerprint=fingerprint, response_json=json.dumps(response)))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        receipt = db.scalar(select(MessageReceipt).where(MessageReceipt.employee_id == user.id, MessageReceipt.request_id == request_id))
        if not receipt:
            raise
        return receipt_response(db, receipt, fingerprint)
    return response

def apply_proposal(db, user, action):
    p = Proposal.model_validate_json(action.payload)
    if p.kind == 'request_updates':
        return create_requests(db,user,p.recipient_ids,p.request_prompt,p.channel)
    if p.kind == 'create':
        existing = list(db.scalars(select(WorkItem).where(WorkItem.owner_id == user.id)))
        if any(w.title.casefold() == p.title.casefold() for w in existing):
            raise HTTPException(409, 'That commitment already exists. Update the existing work instead.')
        return create_work(db, user, WorkCreate(title=p.title, project_id=p.project_id, owner_id=user.id, due_date=p.due_date, effort_hours=p.effort_hours))
    work = get_work(db, user, p.work_item_id, edit=True)
    if work.owner_id != user.id:
        raise HTTPException(403, 'Only the work owner can confirm an assistant update.')
    db.refresh(work, with_for_update=True)
    base = json.loads(action.base_snapshot)
    if not base or base != snapshot(db, work):
        raise HTTPException(409, 'Work changed since this proposal was drafted. Dismiss it and send a fresh update.')
    return patch_work(db, user, work, WorkPatch(status=p.status, progress=p.progress, remaining_hours=p.remaining_hours, due_date=p.due_date, note=p.note))
