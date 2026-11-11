"""Permission-checked requests shared by the chat UI and future delivery adapters."""
import re
from collections import Counter
from fastapi import HTTPException
from sqlalchemy import select
from backend.app.models import Dependency, Employee, UpdateRequest, WorkItem, now
from backend.app.schemas import WorkPatch
from backend.app.core.access import profile_ids
from backend.app.services.work import OPEN_DEP, audit, notify, patch_work, get_work, serialize_work, visible_work
from backend.app.channels.delivery import CHANNELS, CHANNEL_LABELS


def allowed_recipients(db,user):
    scope=profile_ids(db,user)
    return [p for p in db.scalars(select(Employee).where(Employee.active.is_(True))) if p.id in scope and p.id!=user.id]


def validate_recipients(db,user,ids):
    allowed={p.id:p for p in allowed_recipients(db,user)}
    unique=list(dict.fromkeys(ids))
    if not unique:raise HTTPException(422,'Choose at least one person in your reporting scope.')
    if any(i not in allowed for i in unique):raise HTTPException(403,'You can request updates only from active people in your reporting team. The Management can request organization-wide updates.')
    return [allowed[i] for i in unique]


def create_requests(db,user,ids,prompt,channel='in_app'):
    recipients=validate_recipients(db,user,ids)
    if channel not in CHANNELS:raise HTTPException(422,'Unsupported communication channel.')
    records=[]
    for person in recipients:
        previous=db.scalar(select(UpdateRequest).where(UpdateRequest.requester_id==user.id,UpdateRequest.recipient_id==person.id,UpdateRequest.channel==channel,UpdateRequest.status.in_(('Queued','Delivered'))).order_by(UpdateRequest.id.desc()))
        if previous:
            records.append(previous);continue
        request=UpdateRequest(requester_id=user.id,recipient_id=person.id,prompt=prompt,channel=channel)
        db.add(request);db.flush()
        # The reply goes through the check-in handler too, so it also updates the work (plan 5).
        from backend.app.services.proactive import open_request_check_in,record_request_message
        check_in=open_request_check_in(db,request,person)
        if check_in:record_request_message(db,check_in,user,request)
        result=CHANNELS[channel].prepare(db,request,user,person)
        request.status=result.state;request.delivery_detail=result.detail
        notify_skipped_managers(db,user,person,request)
        audit(db,user,f'Requested a work update from {person.name} through {CHANNEL_LABELS[channel]}.')
        records.append(request)
    db.flush()
    return records


def skipped_managers(db, sender, recipient):
    """The managers between sender and recipient, when the sender is higher up the recipient's reporting line.
    Empty when the sender is not above them (a peer, or someone in another line)."""
    chain, seen, current = [], {recipient.id}, recipient.manager_id
    while current and current not in seen:
        if current == sender.id:
            return chain
        seen.add(current)
        person = db.get(Employee, current)
        if not person:
            break
        chain.append(person)
        current = person.manager_id
    return []


def notify_skipped_managers(db, sender, recipient, request):
    """A senior asked someone further down: each manager in between hears about it (TeamPulse and Google Chat)."""
    from backend.app.channels import google_chat
    asked = 'knocked on' if request.kind == 'knock' else 'asked'
    for manager in skipped_managers(db, sender, recipient):
        if not manager.active:
            continue
        text = f'{sender.name} {asked} {recipient.name} (in your team) for an update: "{request.prompt}"'
        notify(db, manager.id, f'skip-level:{request.id}:{manager.id}', text, request.work_item_id)
        google_chat.queue_message(db, manager.id, text)


def knock(db, user, work):
    """Knock knock: ask everyone involved in a commitment how it is going, in TeamPulse and by Google Chat DM.

    Involved: the assignee, and the owners of the open dependencies it waits on (asked about their linked
    commitment). Anyone who can see the commitment may knock. Nobody is knocked twice about the same thing while
    a knock is unanswered. A reply goes through the check-in handler, so it also updates the work.
    """
    from backend.app.services.proactive import open_request_check_in, record_request_message
    if work.status == 'Completed':
        raise HTTPException(409, 'This commitment is already complete.')
    targets = []
    if work.owner_id and work.owner_id != user.id:
        owner = db.get(Employee, work.owner_id)
        if owner and owner.active:
            targets.append((owner, work.id, f'Knock knock: how is "{work.title}" going? Share progress, what is left, and anything blocking it.'))
    for dep in db.scalars(select(Dependency).where(Dependency.work_item_id == work.id, Dependency.status.in_(OPEN_DEP)).order_by(Dependency.id)):
        if dep.owner_id == user.id or any(person.id == dep.owner_id for person, _, _ in targets):
            continue
        person = db.get(Employee, dep.owner_id)
        if not person or not person.active:
            continue
        upstream = db.get(WorkItem, dep.upstream_work_id) if dep.upstream_work_id else None
        own = upstream.id if upstream and upstream.owner_id == person.id and upstream.status != 'Completed' else None
        targets.append((person, own, f'Knock knock: "{work.title}" is waiting on you for "{dep.deliverable}". How is it going, and when can it be ready?'))
    if not targets:
        raise HTTPException(409, 'Nobody else is working on this commitment yet.')
    knocked, already = [], []
    for person, own, prompt in targets:
        waiting = db.scalar(select(UpdateRequest.id).where(UpdateRequest.kind == 'knock', UpdateRequest.requester_id == user.id,
                                                           UpdateRequest.recipient_id == person.id, UpdateRequest.prompt == prompt,
                                                           UpdateRequest.status.in_(('Queued', 'Delivered'))))
        if waiting:
            already.append(person.name)
            continue
        request = UpdateRequest(requester_id=user.id, recipient_id=person.id, prompt=prompt, channel='google_chat', kind='knock', work_item_id=own)
        db.add(request)
        db.flush()
        check_in = open_request_check_in(db, request, person)
        if check_in:
            record_request_message(db, check_in, user, request)
        result = CHANNELS['google_chat'].prepare(db, request, user, person)
        request.status, request.delivery_detail = result.state, result.detail
        notify_skipped_managers(db, user, person, request)
        audit(db, user, f'Knocked on {person.name} about "{work.title}".', work.id)
        knocked.append(person.name)
    db.flush()
    return {'knocked': knocked, 'already': already}


def serialize_request(db,request,user):
    sender=db.get(Employee,request.requester_id);recipient=db.get(Employee,request.recipient_id)
    authorized=bool(sender and sender.active and recipient and recipient.active and (request.kind=='knock' or recipient.id in profile_ids(db,sender)))
    visible_response=request.response if authorized else None
    return {'id':request.id,'requester_id':request.requester_id,'recipient_id':request.recipient_id,'requester_name':sender.name if sender else 'Former teammate','recipient_name':recipient.name if recipient else 'Former teammate','prompt':request.prompt,'channel':request.channel,'status':request.status,'delivery_detail':request.delivery_detail,'response':visible_response,'work_item_id':request.work_item_id if authorized else None,'created_at':request.created_at.isoformat()+'Z','responded_at':request.responded_at.isoformat()+'Z' if request.responded_at else None,'can_reply':authorized and user.id==request.recipient_id and request.status=='Delivered','access_changed':not authorized,'kind':request.kind,
            'attachments':request_attachments(db,request,user) if authorized else []}


def request_attachments(db,request,user):
    from backend.app.api.routes.attachments import serialize_attachments
    from backend.app.models import Attachment
    rows=list(db.scalars(select(Attachment).where(Attachment.update_request_id==request.id).order_by(Attachment.id)))
    return serialize_attachments(db,rows,user) if rows else []


def reply_to_request(db,user,request,body):
    if request.recipient_id!=user.id:raise HTTPException(404,'Update request not found.')
    if request.status=='Responded':return request
    if request.status!='Delivered':raise HTTPException(409,'This request has not been delivered or is no longer active.')
    sender=db.get(Employee,request.requester_id)
    if not sender or not sender.active or (request.kind!='knock' and user.id not in profile_ids(db,sender)):raise HTTPException(403,'Reporting access changed. Ask your current manager for a fresh request.')
    if any(v is not None for v in (body.progress,body.remaining_hours,body.status)) and not body.work_item_id:raise HTTPException(422,'Select the work item this progress update belongs to.')
    if body.work_item_id:
        work=get_work(db,user,body.work_item_id,edit=True)
        if work.owner_id!=user.id:raise HTTPException(403,'Only your own work can be updated in a reply.')
        percent=re.search(r'\b(\d{1,3})\s*%',body.message)
        hours=re.search(r'\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:left|remaining)',body.message,re.I)
        progress=body.progress if body.progress is not None else int(percent[1]) if percent else None
        remaining=body.remaining_hours if body.remaining_hours is not None else float(hours[1]) if hours else None
        if progress is not None and not 0<=progress<=100:raise HTTPException(422,'Progress must be between 0 and 100 percent.')
        if remaining is not None and not 0<=remaining<=1000:raise HTTPException(422,'Remaining effort must be between 0 and 1000 hours.')
        patch_work(db,user,work,WorkPatch(progress=progress,remaining_hours=remaining,status=body.status,note=body.message))
        request.work_item_id=work.id
    request.response=body.message;request.responded_at=now();request.status='Responded'
    from backend.app.models import CheckIn
    for check_in in db.scalars(select(CheckIn).where(CheckIn.update_request_id==request.id,CheckIn.status=='Open')):
        check_in.status='Done'  # answered in the inbox; the check-in handler sets its own status afterwards
    from backend.app.services.work import notify
    notify(db,sender.id,f'update-response:{request.id}',f'{user.name} replied to your update request.',request.work_item_id)
    db.flush()
    return request


def resolve_people(db,user,message,selected_ids=None):
    if selected_ids:return validate_recipients(db,user,selected_ids),None
    text=message.casefold();people=list(db.scalars(select(Employee).where(Employee.active.is_(True))))
    if re.search(r'\b(my team|everyone|all staff|all employees|all reports)\b',text):
        targets=allowed_recipients(db,user)
        return (targets,None) if targets else ([], 'You do not currently have a reporting team. You can update your own work directly.')
    exact=[p for p in people if p.email.casefold() in text or re.search(r'(?<!\w)'+re.escape(p.name.casefold())+r'(?!\w)',text)]
    duplicates=Counter(p.name.casefold() for p in exact)
    if any(v>1 for v in duplicates.values()) and not any(p.email.casefold() in text for p in exact):return [],'There is more than one person with that name. Use Add people to select the intended teammate.'
    if not exact:
        first=[p for p in people if re.search(r'(?<!\w)@?'+re.escape(p.name.split()[0].casefold())+r'(?!\w)',text)]
        counts=Counter(p.name.split()[0].casefold() for p in first)
        if any(v>1 for v in counts.values()):return [],'That first name matches several teammates. Use their full name or Add people to choose.'
        exact=first
    if not exact:return [],'Who should I ask? Mention a full name or use Add people. No request has been sent.'
    return validate_recipients(db,user,[p.id for p in exact]),None


def coordination_intent(db,user,message,selected_ids=None):
    text=message.casefold()
    request=bool(re.search(r'\b(ask|request|collect|follow up|get|take|ping|remind|check with)\b',text) and re.search(r'\b(updates?|status|progress|blockers?|plans?)\b',text))
    if request:
        people,clarification=resolve_people(db,user,message,selected_ids)
        if clarification:return {'reply':clarification,'proposal':None}
        focus=re.search(r'\b(?:about|regarding)\s+(.+)',message,re.I)
        prompt=('Please share an update about '+focus.group(1).strip()+', including progress, expected completion, and any blockers.') if focus else 'Please share a brief update on your current work, expected completion, and any blockers.'
        names=', '.join(p.name for p in people[:4])+(' and '+str(len(people)-4)+' more' if len(people)>4 else '')
        return {'reply':f'I can request updates from {names}. Confirm below to deliver the request to their TeamPulse inbox and, where they have connected it, Google Chat.','proposal':{'kind':'request_updates','recipient_ids':[p.id for p in people],'request_prompt':prompt,'channel':'google_chat'}}
    if re.search(r'\b(who is blocked|who.s blocked|team summary|team overview|summarize my team)\b',text):
        works=[serialize_work(db,w) for w in visible_work(db,user) if w.owner_id in profile_ids(db,user) and w.status!='Completed']
        if 'blocked' in text:works=[w for w in works if w['status'] in ('Blocked','Partially Blocked')]
        people={p.id:p.name for p in db.scalars(select(Employee))}
        lines=[f'• {people.get(w["owner_id"],"Unassigned")}: {w["title"]} — {w["health"]}. {w["next_action"]}' for w in works[:10]]
        return {'reply':'Recorded team work:\n'+'\n'.join(lines) if lines else 'No matching commitments are recorded in your reporting scope.','proposal':None}
    people=list(db.scalars(select(Employee).where(Employee.active.is_(True))))
    if re.search(r'\b(show|summarize|what|how|tell me)\b',text) and (selected_ids or any(p.name.casefold() in text for p in people)):
        targets,clarification=resolve_people(db,user,message,selected_ids)
        if clarification:return {'reply':clarification,'proposal':None}
        lines=[]
        for person in targets:
            work=[serialize_work(db,w) for w in visible_work(db,user) if w.owner_id==person.id and w.status!='Completed']
            lines.append(person.name+':')
            lines.extend(f'• {w["title"]}: {w["status"]}, {w["progress"]}% complete, {w["remaining_hours"]:g}h remaining, expected {w["due_date"]}. {w["health"]}.' for w in work[:5])
            if not work:lines.append('• No active commitments are recorded. Confirm availability before assigning work.')
        return {'reply':'\n'.join(lines),'proposal':None}
    return None
