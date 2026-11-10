"""The proactive assistant: daily check-ins, and one inbound router for Google Chat and the in-app chat
(plan sections 5 and 6).

Outbound: run_check_ins (every workflow tick) sends at most one daily check-in per person per day. The
unique (employee_id, kind, period) constraint on check_ins makes a second tick, a restart or a second
process unable to send twice.

Inbound: handle_inbound sees every message first: commands, then a pending confirmation, then a reply
to an open check-in, and otherwise the normal assistant (converse).

Never log message text or model output here; ids, counts and timings only.
"""
import hashlib
import json
import logging
import re
import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from backend.app.core import config
from backend.app.models import (
    AgentAction, CheckIn, Conversation, Dependency, Employee, MessageReceipt, Project, UpdateRequest, WorkItem, now,
)
from backend.app.services import attachments as files
from backend.app.services import checkin_reply
from backend.app.services.checkin_reply import AGENT, NO, YES, short_date, short_title, _md
from backend.app.services.formatting import sanitize
from backend.app.services.work import ACTIVE, OPEN_DEP, business_day, latest_commitment, notify, today

log = logging.getLogger('teampulse.checkin')

OPEN_STATES = ('Open', 'Clarifying', 'Confirming')
REQUEST_ITEMS = 6
REQUEST_DAYS = 7
FILE_QUESTION_HOURS = 24
HELP = ('Hi, I\'m TeamPulse. Tell me how your work is going in your own words, for example '
        '"the Atlas review is 60% done, 4 hours left". On weekdays I check in about work that needs your word.\n\n'
        '- `pause`: no check-ins until tomorrow\n- `resume`: check-ins back on\n- `undo`: reverse my last automatic update\n'
        '- `help`: this message')


# ---- Time --------------------------------------------------------------------------------------

def org_now() -> datetime:
    return datetime.now(ZoneInfo(config.ORG_TIMEZONE))


def to_utc(local: datetime) -> datetime:
    return local.astimezone(timezone.utc).replace(tzinfo=None)


# ---- Selection -----------------------------------------------------------------------------------

def _recently_confirmed(work, hours: int) -> bool:
    return bool(work.confirmed_at and (now() - work.confirmed_at).total_seconds() <= hours * 3600)


def select_items(db, person) -> list[dict]:
    """What needs this person's word, in order, up to CHECKIN_MAX_ITEMS:
    1. owned active work overdue or due within 1 business day, not confirmed in the last 24h;
    2. open dependencies they owe that are overdue or due within 1 business day (through the commitment behind them);
    3. owned active work whose confirmation is stale (>36h, the work_health rule).
    Completed work, work awaiting verification, unaccepted commitments and archived projects are skipped."""
    base = today()
    soon = business_day(base, 1)
    owned = list(db.scalars(select(WorkItem).join(Project).where(
        Project.archived.is_(False), WorkItem.owner_id == person.id,
        WorkItem.status.in_([s for s in ACTIVE if s != 'Awaiting Verification'])).order_by(WorkItem.id)))
    commitments = {w.id: latest_commitment(db, w.id) for w in owned}
    owned = [w for w in owned if commitments[w.id] and commitments[w.id].confirmed_by]
    by_due = sorted(owned, key=lambda w: (commitments[w.id].due_date, w.id))
    chosen, items = set(), []

    def add(work, dependency=None):
        if work.id in chosen or len(items) >= config.CHECKIN_MAX_ITEMS:
            return
        chosen.add(work.id)
        items.append({'n': len(items) + 1, 'work_item_id': work.id, 'dependency_id': dependency.id if dependency else None})

    for work in by_due:
        if commitments[work.id].due_date <= soon and not _recently_confirmed(work, 24):
            add(work)
    owed = db.scalars(select(Dependency).where(Dependency.owner_id == person.id, Dependency.status.in_([s for s in OPEN_DEP if s != 'Delivered']),
                                               Dependency.due_date <= soon).order_by(Dependency.due_date, Dependency.id))
    owned_ids = {w.id: w for w in owned}
    for dep in owed:
        work = owned_ids.get(dep.upstream_work_id)
        waiting = db.get(WorkItem, dep.work_item_id)
        project = db.get(Project, waiting.project_id) if waiting else None
        if work and project and not project.archived and not _recently_confirmed(work, 24):
            add(work, dep)
    for work in by_due:
        if not _recently_confirmed(work, 36):
            add(work)
    return items


# ---- Composing --------------------------------------------------------------------------------------

def _due(d) -> str:
    base = today()
    if d < base:
        return 'was due ' + short_date(d, base)
    return 'due ' + short_date(d, base)


def item_line(db, item) -> str:
    work = db.get(WorkItem, item['work_item_id'])
    if item.get('dependency_id'):
        dep = db.get(Dependency, item['dependency_id'])
        requester = db.get(Employee, dep.requester_id)
        first = requester.name.split()[0] if requester else 'Someone'
        return f'{item["n"]}. **{short_title(_md(dep.deliverable))}** ({first} is waiting): {_due(dep.due_date)}'
    c = latest_commitment(db, work.id)
    return f'{item["n"]}. **{short_title(_md(work.title))}**: {work.progress}%, {_due(c.due_date)}'


def _example(count: int) -> str:
    return '`80%, 2h left` or `done`' if count == 1 else f'`1 is 80%, 2h left. {count} is done`'


def compose_daily(db, person, items, local: datetime | None = None) -> str:
    local = local or org_now()
    first = person.name.split()[0]
    greeting = 'Morning' if local.hour < 12 else 'Hi'
    things = '1 thing' if len(items) == 1 else f'{len(items)} things'
    lines = '\n'.join(item_line(db, i) for i in items)
    return (f'{greeting}, {first}. A quick check on {things}:\n\n{lines}\n\n'
            f'Reply in your own words, for example {_example(len(items))}.\nSay `pause` to skip check-ins until tomorrow.')


# ---- Outbound -------------------------------------------------------------------------------------

def expire_check_ins(db) -> int:
    """Open check-ins past expires_at, or whose manager request was cancelled, become Expired;
    their unconfirmed proposals become Dismissed."""
    stale = list(db.scalars(select(CheckIn).where(CheckIn.status.in_(OPEN_STATES), CheckIn.expires_at <= now())))
    for ci in db.scalars(select(CheckIn).join(UpdateRequest, UpdateRequest.id == CheckIn.update_request_id)
                         .where(CheckIn.status.in_(OPEN_STATES), UpdateRequest.status == 'Cancelled')):
        if ci not in stale:
            stale.append(ci)
    for ci in stale:
        ci.status = 'Expired'
        for action in db.scalars(select(AgentAction).where(AgentAction.check_in_id == ci.id, AgentAction.status == 'Proposed')):
            action.status = 'Dismissed'
    if stale:
        db.commit()
    return len(stale)


def _paused(person, day) -> bool:
    return bool(person.checkins_paused_until and day < person.checkins_paused_until)


def run_check_ins(db, at: datetime | None = None) -> int:
    """Called every tick. Sends at most one daily check-in per person per day. Returns how many were created."""
    expire_check_ins(db)
    if not config.PROACTIVE_ENABLED:
        return 0
    local = at or org_now()
    if local.weekday() >= 5 or not (config.CHECKIN_HOUR <= local.hour < 18):
        return 0
    period = local.date().isoformat()
    expires = to_utc(datetime.combine(local.date(), time(18, 0), tzinfo=local.tzinfo))
    from backend.app.channels import google_chat
    created = 0
    people = list(db.scalars(select(Employee).where(Employee.active.is_(True), Employee.proactive_checkins.is_(True)).order_by(Employee.id)))
    for person in people:
        if _paused(person, local.date()):
            continue
        if db.scalar(select(CheckIn.id).where(CheckIn.employee_id == person.id, CheckIn.kind == 'daily', CheckIn.period == period)):
            continue
        items = select_items(db, person)
        if not items:
            continue  # no message is good news
        text = compose_daily(db, person, items, local)
        check_in = CheckIn(employee_id=person.id, kind='daily', period=period, items_json=json.dumps(items),
                           status='Open', expires_at=expires, message=text, last_message_at=now())
        try:
            with db.begin_nested():
                db.add(check_in)
                db.flush()
        except IntegrityError:
            continue  # another tick or process won the race
        db.add(Conversation(employee_id=person.id, role='assistant', message=text, agent=AGENT))
        things = '1 commitment needs' if len(items) == 1 else f'{len(items)} commitments need'
        notify(db, person.id, f'checkin:{check_in.id}', f'Daily check-in: {things} your word. Reply in AI chat.')
        google_chat.queue_message(db, person.id, text, check_in_id=check_in.id, dry_run=config.PROACTIVE_DRY_RUN)
        db.commit()
        created += 1
    if created:
        log.info('Created %s daily check-in(s) for %s.', created, period)
    return created


def open_request_check_in(db, request, recipient) -> CheckIn | None:
    """A manager's update request becomes a check-in, so the reply also updates the work.
    Items: the request's work item, or the recipient's active owned work (soonest first)."""
    if request.work_item_id:
        works = [w for w in [db.get(WorkItem, request.work_item_id)] if w and w.owner_id == recipient.id and w.status in ACTIVE]
    else:
        works = list(db.scalars(select(WorkItem).join(Project).where(
            Project.archived.is_(False), WorkItem.owner_id == recipient.id,
            WorkItem.status.in_([s for s in ACTIVE if s != 'Awaiting Verification']))))
        works.sort(key=lambda w: ((c := latest_commitment(db, w.id)) and c.due_date or today(), w.id))
    items = [{'n': i + 1, 'work_item_id': w.id, 'dependency_id': None} for i, w in enumerate(works[:REQUEST_ITEMS])]
    if not items:
        return None
    check_in = CheckIn(employee_id=recipient.id, kind='request', period=f'r{request.id}', update_request_id=request.id,
                       items_json=json.dumps(items), status='Open', expires_at=now() + timedelta(days=REQUEST_DAYS), last_message_at=now())
    try:
        with db.begin_nested():
            db.add(check_in)
            db.flush()
    except IntegrityError:
        return db.scalar(select(CheckIn).where(CheckIn.employee_id == recipient.id, CheckIn.kind == 'request', CheckIn.period == f'r{request.id}'))
    return check_in


def request_items_text(db, check_in) -> str:
    items = json.loads(check_in.items_json or '[]')
    if not items:
        return ''
    example = _example(len(items))
    return 'Your work:\n' + '\n'.join(item_line(db, i) for i in items) + f'\n\nReply in your own words, for example {example}.'


def record_request_message(db, check_in, sender, request):
    """The request as an assistant turn in the recipient's AI chat, with the numbered items."""
    text = f'{sender.name} asked for an update:\n{request.prompt}\n\n' + request_items_text(db, check_in)
    check_in.message = text
    db.add(Conversation(employee_id=check_in.employee_id, role='assistant', message=sanitize(text), agent=AGENT))
    return text


# ---- Inbound ----------------------------------------------------------------------------------------

def newest_check_in(db, employee, states=OPEN_STATES) -> CheckIn | None:
    for check_in in db.scalars(select(CheckIn).where(CheckIn.employee_id == employee.id, CheckIn.status.in_(states),
                                                     CheckIn.expires_at > now()).order_by(CheckIn.id.desc())):
        if check_in.update_request_id:
            request = db.get(UpdateRequest, check_in.update_request_id)
            if not request or request.status == 'Cancelled':
                continue
        return check_in
    return None


def _fingerprint(message, work_id, recipient_ids) -> str:
    # The same formula as converse(), so one request id has one fingerprint whichever path answered it.
    return hashlib.sha256(json.dumps([message, work_id, sorted(recipient_ids or [])]).encode()).hexdigest()


def _is_new_command(db, employee, text) -> bool:
    from backend.app.services.coordination import coordination_intent
    if text.lower().startswith('plan:'):
        return True
    try:
        intent = coordination_intent(db, employee, text)
    except HTTPException:
        return True
    if not intent:
        return False
    return bool(intent.get('proposal')) or not re.search(r'\d|done|finish|complete|block|waiting|late', text, re.I)


def _action_json(action):
    return {'id': action.id, 'payload': json.loads(action.payload), 'status': action.status} if action else None


def _finish(db, employee, text, reply, request_id, fingerprint, *, actions=(), auto_applied=False, mode='offline', steps=('checkin',)):
    reply = sanitize(reply) or 'Thanks.'
    db.add_all([Conversation(employee_id=employee.id, role='user', message=text),
                Conversation(employee_id=employee.id, role='assistant', message=reply, agent=AGENT)])
    response = {'reply': reply, 'mode': mode, 'auto_applied': auto_applied, 'agent': AGENT, 'steps': list(steps),
                'action': _action_json(actions[0]) if actions else None, 'actions': [_action_json(a) for a in actions]}
    db.add(MessageReceipt(employee_id=employee.id, request_id=request_id, fingerprint=fingerprint, response_json=json.dumps(response)))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        from backend.app.services.assistant import receipt_response
        receipt = db.scalar(select(MessageReceipt).where(MessageReceipt.employee_id == employee.id, MessageReceipt.request_id == request_id))
        if not receipt:
            raise
        return receipt_response(db, receipt, fingerprint)
    return response


def _command(db, employee, cmd) -> str | None:
    if cmd == 'pause':
        employee.checkins_paused_until = org_now().date() + timedelta(days=1)
        return 'Paused. I\'ll check in again tomorrow. Say `resume` to turn check-ins back on.'
    if cmd == 'resume':
        employee.checkins_paused_until = None
        if not employee.proactive_checkins:
            return 'Daily check-ins are off in your Settings. Turn on "Daily check-ins" there to get them again.'
        return 'Check-ins are back on.'
    if cmd == 'undo':
        return checkin_reply.undo(db, employee)
    if cmd == 'help':
        return HELP
    return None


def _owned_active(db, employee, limit=5):
    works = list(db.scalars(select(WorkItem).join(Project).where(Project.archived.is_(False), WorkItem.owner_id == employee.id,
                                                                  WorkItem.status.in_(ACTIVE)).order_by(WorkItem.id)))
    works.sort(key=lambda w: ((c := latest_commitment(db, w.id)) and c.due_date or today(), w.id))
    return works[:limit]


def _ask_for_file_target(db, employee, refs, text) -> str | None:
    """A file (or a bare link) in Chat with no check-in open: ask which commitment it is for."""
    works = _owned_active(db, employee)
    if not works:
        return None
    items = [{'n': i + 1, 'work_item_id': w.id, 'dependency_id': None} for i, w in enumerate(works)]
    pending = {'answered': [i['n'] for i in items], 'action_ids': [], 'question': {'ambiguity': 'which_item_for_file', 'n': None, 'asked': True},
               'queue': [], 'files': [{k: v for k, v in r.items() if k != 'start'} for r in refs], 'type': 'clarify', 'ambiguity': 'which_item_for_file', 'n': None}
    check_in = CheckIn(employee_id=employee.id, kind='file', period=now().strftime('%Y%m%d%H%M%S%f')[:20], items_json=json.dumps(items),
                       status='Clarifying', clarify_rounds=1, pending_json=json.dumps(pending), expires_at=now() + timedelta(hours=FILE_QUESTION_HOURS),
                       last_message_at=now())
    db.add(check_in)
    db.flush()
    lines = '\n'.join(f'{i["n"]}. **{short_title(_md(db.get(WorkItem, i["work_item_id"]).title))}**' for i in items)
    return f'Which of your commitments is this for? Reply with its number:\n\n{lines}'


async def handle_inbound(db, employee, text, channel, request_id=None, *, work_id=None, recipient_ids=None,
                         chat_attachments=None, chat_message='') -> dict:
    """Every message from a person, from Google Chat or the in-app chat, goes through here first.
    Returns {'reply': str (markdown subset), 'action': ...} in the same shape converse() returns."""
    from backend.app.services.assistant import converse, receipt_response
    text = (text or '').strip()[:4000]
    chat_attachments = [a for a in (chat_attachments or []) if isinstance(a, dict)]
    request_id = request_id or str(uuid.uuid4())
    fingerprint = _fingerprint(text, work_id, recipient_ids)
    receipt = db.scalar(select(MessageReceipt).where(MessageReceipt.employee_id == employee.id, MessageReceipt.request_id == request_id))
    if receipt:
        return receipt_response(db, receipt, fingerprint)
    shown = text or ('Sent ' + ', '.join(f['name'] for f in files.chat_files(chat_attachments)) if chat_attachments else '')

    # 1. Commands.
    cmd = text.lower().strip(' .!')
    if not recipient_ids and (reply := _command(db, employee, cmd)) is not None:
        return _finish(db, employee, shown, reply, request_id, fingerprint, steps=('command',))

    # 2. A pending confirmation: yes applies, no dismisses, anything else is read again.
    confirming = newest_check_in(db, employee, ('Confirming',))
    if confirming and not recipient_ids and not chat_attachments and (YES.match(text) or NO.match(text)):
        reply = checkin_reply.resolve_confirmation(db, employee, confirming, bool(YES.match(text)))
        return _finish(db, employee, shown, reply, request_id, fingerprint, steps=('checkin', 'confirmation'))

    # 3. A reply to an open check-in.
    check_in = newest_check_in(db, employee)
    if check_in and check_in.kind == 'file' and not checkin_reply.NUMBER_ONLY.match(text):
        check_in.status = 'Expired'  # they moved on without saying which commitment the file was for
        check_in = newest_check_in(db, employee)
    selected_elsewhere = False
    if check_in and work_id:
        selected_elsewhere = work_id not in {i['work_item_id'] for i in json.loads(check_in.items_json or '[]')}
    if check_in and not recipient_ids and not selected_elsewhere and (chat_attachments or text) and not _is_new_command(db, employee, text):
        result = await checkin_reply.handle(db, employee, check_in, text, channel=channel, chat_attachments=chat_attachments,
                                            chat_message=chat_message)
        if not result.get('handoff'):
            return _finish(db, employee, shown, result['reply'], request_id, fingerprint, actions=result['actions'],
                           auto_applied=result['auto_applied'], mode=result['mode'])

    # 4. The normal assistant. Files and links still find their commitment.
    refs = files.chat_files(chat_attachments) + files.links_in(text)
    if refs and channel == 'in_app' and work_id:
        work = db.get(WorkItem, work_id)
        if work and work.owner_id == employee.id:
            files.capture(db, employee, refs=refs, work_item_ids=[work.id], note=text, channel=channel)
    elif refs and channel == 'google_chat':
        bare = len(files.URL.sub('', text).strip()) < 3
        if chat_attachments or bare:
            question = _ask_for_file_target(db, employee, refs, text)
            if question:
                return _finish(db, employee, shown, question, request_id, fingerprint, steps=('attachments',))
    if not text:
        return _finish(db, employee, shown, HELP, request_id, fingerprint, steps=('guide',))
    return await converse(db, employee, text, work_id, request_id, recipient_ids)


# ---- Admin preview -------------------------------------------------------------------------------------

def preview(db, day) -> list[dict]:
    """Check-ins composed for one org-local day (daily ones by period, others by creation date)."""
    start = to_utc(datetime.combine(day, time(0, 0), tzinfo=ZoneInfo(config.ORG_TIMEZONE)))
    rows = list(db.scalars(select(CheckIn).where((CheckIn.period == day.isoformat()) |
                                                 ((CheckIn.kind != 'daily') & (CheckIn.created_at >= start) & (CheckIn.created_at < start + timedelta(days=1))))
                           .order_by(CheckIn.id)))
    from backend.app.models import OutboxMessage
    out = []
    for ci in rows:
        person = db.get(Employee, ci.employee_id)
        outbox = db.scalar(select(OutboxMessage).where(OutboxMessage.check_in_id == ci.id).order_by(OutboxMessage.id.desc()))
        items = json.loads(ci.items_json or '[]')
        out.append({'id': ci.id, 'employee_id': ci.employee_id, 'employee_name': person.name if person else 'Former teammate',
                    'kind': ci.kind, 'status': ci.status, 'period': ci.period, 'clarify_rounds': ci.clarify_rounds,
                    'items': [{'n': i['n'], 'work_item_id': i['work_item_id'], 'title': checkin_reply.item_title(db, i)} for i in items],
                    'message': ci.message, 'chat_delivery': outbox.status if outbox else 'Not linked',
                    'created_at': ci.created_at.isoformat() + 'Z', 'expires_at': ci.expires_at.isoformat() + 'Z'})
    return out
