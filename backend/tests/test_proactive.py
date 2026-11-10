"""Proactive check-ins, the inbound router, reply handling and attachments (docs/PROACTIVE_ASSISTANT_PLAN.md, section 13)."""
import json
from datetime import timedelta
import httpx
import pytest
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from test_workflows import ctx, login
from test_google_chat import chat, event, post
from backend.app.core import config
from backend.app.channels import google_chat
from backend.app.models import (AgentAction, Attachment, AuditEvent, ChatLink, CheckIn, Commitment, Conversation, Notification,
                                OutboxMessage, WorkItem, now)
from backend.app.services import proactive, checkin_reply
from backend.app.services.work import business_day, latest_commitment, today
from backend.app.api.routes import attachments as attachment_routes


def weekday_morning():
    at = proactive.org_now().replace(hour=10, minute=30, second=0, microsecond=0)
    while at.weekday() >= 5:
        at += timedelta(days=1)
    return at


@pytest.fixture
def on(monkeypatch):
    monkeypatch.setattr(config, 'PROACTIVE_ENABLED', True)
    monkeypatch.setattr(config, 'PROACTIVE_DRY_RUN', True)


def stale(db, *work_ids, hours=48):
    for work_id in work_ids:
        db.get(WorkItem, work_id).confirmed_at = now() - timedelta(hours=hours)
    db.commit()


def run(sessions, at=None):
    with sessions() as db:
        return proactive.run_check_ins(db, at or weekday_morning())


def say(c, text, **extra):
    response = c.post('/api/assistant/chat', json={'message': text, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def work(c, work_id):
    return next(w for w in c.get('/api/state').json()['work'] if w['id'] == work_id)


def checkin(sessions, employee_id):
    with sessions() as db:
        return db.scalar(select(CheckIn).where(CheckIn.employee_id == employee_id).order_by(CheckIn.id.desc()))


# ---- Outbound --------------------------------------------------------------------------------------

def test_one_check_in_per_person_per_day_even_after_a_restart(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 2, 12)
    assert run(sessions) >= 2
    assert run(sessions) == 0  # a second tick (or a restart at 10:01) sends nothing new
    with sessions() as db:
        ci = db.scalar(select(CheckIn).where(CheckIn.employee_id == 1, CheckIn.kind == 'daily'))
        items = json.loads(ci.items_json)
        # The dependency Nitish owes comes first (through its commitment), then the stale one.
        assert [i['work_item_id'] for i in items] == [12, 1] and items[0]['dependency_id']
        assert ci.message.startswith('Morning, Nitish. A quick check on 2 things:')
        assert '(Priya is waiting)' in ci.message and '**Employee document module**' in ci.message
        assert db.scalar(select(Conversation).where(Conversation.employee_id == 1).order_by(Conversation.id.desc())).agent == 'Check-in agent'
        assert db.scalar(select(func.count(Notification.id)).where(Notification.key == f'checkin:{ci.id}')) == 1
        # The unique constraint is the guard when two processes race.
        db.add(CheckIn(employee_id=1, kind='daily', period=ci.period, items_json='[]', expires_at=ci.expires_at))
        with pytest.raises(IntegrityError):
            db.flush()


def test_check_ins_respect_the_switch_the_window_opt_out_and_pause(ctx, on, monkeypatch):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 2, 12)
    at = weekday_morning()
    assert run(sessions, at.replace(hour=9)) == 0
    assert run(sessions, at.replace(hour=18)) == 0
    saturday = at + timedelta(days=(5 - at.weekday()))
    assert run(sessions, saturday) == 0
    login(c, 'rahul')
    assert c.patch('/api/me/preferences', json={'proactive_checkins': False}).json()['proactive_checkins'] is False
    login(c)
    assert say(c, 'pause')['reply'].startswith('Paused.')
    monkeypatch.setattr(config, 'PROACTIVE_ENABLED', False)
    assert run(sessions, at) == 0
    monkeypatch.setattr(config, 'PROACTIVE_ENABLED', True)
    run(sessions, at)
    with sessions() as db:
        assert not db.scalar(select(CheckIn.id).where(CheckIn.employee_id.in_((1, 2))))
    assert say(c, 'resume')['reply'] == 'Check-ins are back on.'


def test_dry_run_stores_chat_messages_as_skipped(ctx, on, monkeypatch):
    c, sessions = ctx
    monkeypatch.setattr(google_chat, 'outbound_enabled', lambda: True)
    sent = []
    monkeypatch.setattr(google_chat, 'send_message', lambda space, text: sent.append(text))
    with sessions() as db:
        db.add(ChatLink(employee_id=2, google_user='users/rahul', space='spaces/rahul'))
        stale(db, 2)
    run(sessions)
    with sessions() as db:
        outbox = db.scalar(select(OutboxMessage).where(OutboxMessage.employee_id == 2))
        assert outbox.status == 'Skipped' and outbox.check_in_id
        google_chat.process_outbox(db)
    assert sent == []
    login(c)
    preview = c.get('/api/admin/check-ins').json()
    assert any(p['employee_name'] == 'Rahul Sharma' and p['chat_delivery'] == 'Skipped' and p['message'] for p in preview['check_ins'])
    login(c, 'rahul')
    assert c.get('/api/admin/check-ins').status_code == 403


# ---- Replies --------------------------------------------------------------------------------------

def test_numbers_apply_now_with_an_audit_trail_and_undo_restores_them(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    before = work(c, 12)
    result = say(c, '1 is 80%, 2h left')
    assert result['agent'] == 'Check-in agent' and result['auto_applied']
    assert '**API integration contract**: 80%, 2h left' in result['reply'] and 'Say `undo`' in result['reply']
    after = work(c, 12)
    assert after['progress'] == 80 and after['remaining_hours'] == 2
    with sessions() as db:
        assert db.scalar(select(AuditEvent).where(AuditEvent.work_item_id == 12).order_by(AuditEvent.id.desc())).message.startswith(
            "Updated by the assistant from Nitish Kumar's check-in reply (AI chat)")
    assert say(c, 'undo')['reply'].startswith('Undone:')
    restored = work(c, 12)
    assert (restored['progress'], restored['remaining_hours']) == (before['progress'], before['remaining_hours'])
    assert 'nothing to undo' in say(c, 'undo')['reply']


def test_undo_leaves_work_that_moved_on(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    say(c, '2 is 30%')
    assert c.patch('/api/work/1', json={'progress': 35, 'note': 'Manual edit'}).status_code == 200
    assert 'changed since then' in say(c, 'undo')['reply']
    assert work(c, 1)['progress'] == 35


def test_completion_waits_for_yes_and_no_leaves_it(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    proposed = say(c, '2 is done')
    assert 'Mark **Employee document module** as done? Reply `yes` or `no`.' in proposed['reply']
    assert proposed['action']['status'] == 'Proposed' and work(c, 1)['status'] != 'Completed'
    assert checkin(sessions, 1).status == 'Confirming'
    assert say(c, 'no')['reply'].startswith('OK, I left it')
    assert work(c, 1)['status'] != 'Completed'
    say(c, '2 is finished')
    assert say(c, 'yes')['reply'].startswith('Done:')
    assert work(c, 1)['status'] == 'Completed'


def test_hedged_completion_is_never_completed(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    reply = say(c, '2 is almost done')['reply']
    assert "I'll keep **Employee document module** open" in reply and work(c, 1)['status'] != 'Completed'


def test_vague_answers_get_two_questions_then_a_polite_end(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    first = say(c, 'going fine')['reply']
    assert first.startswith('Roughly how far along is **Verified API integration contract**?')
    second = say(c, 'still fine')['reply']
    assert second.startswith('Roughly how far along')
    third = say(c, 'all good')['reply']
    assert third.startswith('Thanks, I saved what I could.')
    assert checkin(sessions, 1).status == 'Done'
    # The check-in is closed: the next message goes to the normal assistant.
    assert say(c, 'Summarize my commitments')['agent'] != 'Check-in agent'


def test_a_late_reply_asks_for_a_date_then_a_reason_and_tells_the_manager(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 2)
    run(sessions)
    login(c, 'rahul')
    assert say(c, 'this will be late')['reply'] == 'What date should **Publish the updated database schema** move to?'
    new_date = business_day(today(), 4)
    assert 'What changed?' in say(c, str(new_date))['reply']
    proposal = say(c, 'waiting on client data')
    assert proposal['action']['payload']['due_date'] == str(new_date)
    assert say(c, 'yes')['reply'].startswith('Done:')
    with sessions() as db:
        assert latest_commitment(db, 2).due_date == new_date
        notice = db.scalar(select(Notification).where(Notification.recipient_id == 1, Notification.key.like('checkin-escalation:%')))
        assert notice and 'Rahul moved Publish the updated database schema to' in notice.message and 'client data' in notice.message


def test_a_blocker_on_a_teammate_becomes_a_dependency_after_yes(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    proposed = say(c, '2 is blocked, waiting on Ananya Rao for the upload API')
    assert proposed['action']['payload']['kind'] == 'dependency' and proposed['action']['payload']['owner_id'] == 3
    assert say(c, 'yes')['reply'].startswith('Done:')
    assert work(c, 1)['status'] == 'Partially Blocked'


def test_a_message_for_the_assistant_passes_through_and_the_check_in_stays_open(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    assert say(c, 'What is on my plate this week?')['agent'] != 'Check-in agent'
    assert checkin(sessions, 1).status == 'Open'


def test_validation_drops_what_the_message_does_not_say(ctx, on, monkeypatch):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    from backend.app.services import assistant
    monkeypatch.setattr(assistant, 'provider_configured', lambda: True)

    async def hallucinating(db, employee, thread, text, history, focus):
        return checkin_reply.Extraction(is_reply=True, updates=[
            checkin_reply.ItemUpdate(n=1, progress=55, evidence='1 is going well'),            # 55 is not in the message
            checkin_reply.ItemUpdate(n=2, status='Completed', evidence='it is basically finished'),  # not the person's words
        ])
    monkeypatch.setattr(checkin_reply, 'llm_extract', hallucinating)
    login(c)
    reply = say(c, '1 is going well')['reply']
    assert reply.startswith('Roughly how far along')
    assert work(c, 12)['progress'] == 40 and work(c, 1)['status'] != 'Completed'


def test_the_llm_failing_falls_back_to_the_parser(ctx, on, monkeypatch):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    from backend.app.services import assistant
    monkeypatch.setattr(assistant, 'provider_configured', lambda: True)

    async def broken(*args):
        raise httpx.ConnectError('down')
    monkeypatch.setattr(checkin_reply, 'llm_extract', broken)
    login(c)
    say(c, '1 is 65%')
    assert work(c, 12)['progress'] == 65


def test_extraction_reads_numbered_replies():
    class Thread:
        items = [{'n': 1, 'work_item_id': 1}, {'n': 2, 'work_item_id': 2}]
    assert checkin_reply.ADDR.findall('1 is 70%, 3h left. 2 is done') == ['1', '2']
    assert checkin_reply.PERCENT.findall('1 is 70%, 3h left') == ['70']
    assert [g for g in checkin_reply.HOURS.search('70%, 3h left').groups() if g] == ['3']
    assert not checkin_reply.COMPLETION.search('80% complete')
    assert not checkin_reply.COMPLETION.search('done by friday')
    assert checkin_reply.parse_date('Mon 10 Nov', today()).day == 10


# ---- Manager requests --------------------------------------------------------------------------------

def test_a_manager_request_reply_updates_the_work_and_answers_the_manager(ctx):
    c, sessions = ctx
    login(c)
    request = c.post('/api/update-requests', json={'recipient_ids': [2]}).json()[0]
    login(c, 'rahul')
    history = c.get('/api/assistant/history').json()['messages']
    assert history[-1]['agent'] == 'Check-in agent' and '1. **Publish the updated database schema**' in history[-1]['message']
    result = say(c, '85%, 3h left')
    assert result['reply'].startswith('Thanks. I sent your update to Nitish Kumar.')
    assert work(c, 2)['progress'] == 85
    login(c)
    answered = next(r for r in c.get('/api/update-requests').json() if r['id'] == request['id'])
    assert answered['status'] == 'Responded' and answered['response'] == '85%, 3h left'


def test_with_the_switch_off_manager_requests_still_work(ctx, monkeypatch):
    c, sessions = ctx
    monkeypatch.setattr(config, 'PROACTIVE_ENABLED', False)
    login(c)
    c.post('/api/update-requests', json={'recipient_ids': [2]})
    login(c, 'rahul')
    assert say(c, 'About 90% done')['reply'].startswith('Thanks. I sent your update')
    assert work(c, 2)['progress'] == 90


# ---- Google Chat, files and links ------------------------------------------------------------------------

def upload(name='screenshot.png', content_type='image/png', ref='spaces/rahul/messages/9/attachments/a1'):
    return {'name': ref, 'contentName': name, 'contentType': content_type, 'source': 'UPLOADED_CONTENT',
            'downloadUri': 'https://chat.google.com/api/get_attachment_url?x=1', 'thumbnailUri': 'https://lh3.googleusercontent.com/t',
            'attachmentDataRef': {'resourceName': ref}}


def chat_event(email, text, name, files=()):
    body = event('MESSAGE', email, text, name=name)
    body['message']['attachment'] = list(files)
    return body


def test_chat_check_in_reply_with_a_screenshot_is_kept_and_openable(chat, on, monkeypatch):
    c, sessions, sent = chat
    post(c, event('ADDED_TO_SPACE', 'rahul@teampulse.local'))
    with sessions() as db:
        stale(db, 2)
    run(sessions)
    body = chat_event('rahul@teampulse.local', '1 is 90%', 'spaces/rahul/messages/20', [upload()])
    first = post(c, body).json()['text']
    assert '*Publish the updated database schema*: 90%' in first and 'Attached to *Publish the updated database schema*: screenshot.png' in first
    assert post(c, body).json()['text'] == first  # Google delivered it twice: one row
    with sessions() as db:
        assert db.scalar(select(func.count(Attachment.id))) == 1
    login(c)  # the manager, who is not in the DM
    listing = c.get('/api/attachments', params={'work_item_id': 2}).json()
    row = listing['items'][0]
    assert row['kind'] == 'chat_upload' and row['name'] == 'screenshot.png' and row['employee_name'] == 'Rahul Sharma' and row['can_open']
    assert c.get('/api/attachments', params={'project_id': 1}).json()['items'][0]['id'] == row['id']

    monkeypatch.setattr(google_chat, 'media_request', lambda ref: (f'https://chat.googleapis.com/v1/media/{ref}?alt=media', {}))
    real = httpx.AsyncClient
    monkeypatch.setattr(attachment_routes.httpx, 'AsyncClient',
                        lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b'PNGDATA')), **kw))
    c.headers.pop('Authorization')
    opened = c.get(row['open_url'])
    assert opened.status_code == 200 and opened.content == b'PNGDATA'
    assert opened.headers['content-disposition'].startswith('inline') and opened.headers['content-security-policy'] == 'sandbox'
    assert c.get(f'/api/attachments/{row["id"]}/open?t=forged').status_code == 401


def test_html_and_svg_uploads_download_instead_of_rendering(chat, on, monkeypatch):
    c, sessions, _ = chat
    post(c, event('ADDED_TO_SPACE', 'rahul@teampulse.local'))
    with sessions() as db:
        stale(db, 2)
    run(sessions)
    post(c, chat_event('rahul@teampulse.local', '1 is 95%', 'spaces/rahul/messages/21',
                       [upload('page.html', 'text/html', 'r/a2'), upload('logo.svg', 'image/svg+xml', 'r/a3')]))
    monkeypatch.setattr(google_chat, 'media_request', lambda ref: ('https://chat.googleapis.com/v1/media/x?alt=media', {}))
    real = httpx.AsyncClient
    monkeypatch.setattr(attachment_routes.httpx, 'AsyncClient',
                        lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b'<script>x</script>')), **kw))
    login(c)
    rows = c.get('/api/attachments').json()['items']
    assert {r['name'] for r in rows} == {'page.html', 'logo.svg'} and all(r['thumbnail_url'] is None for r in rows)
    for row in rows:
        opened = c.get(row['open_url'])
        assert opened.headers['content-disposition'].startswith('attachment') and opened.headers['content-type'] == 'application/octet-stream'


def test_a_file_alone_with_two_items_asks_which_one(chat, on):
    c, sessions, _ = chat
    post(c, event('ADDED_TO_SPACE', 'nitish@teampulse.local'))
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    question = post(c, chat_event('nitish@teampulse.local', '', 'spaces/nitish/messages/30', [upload(ref='r/b1')])).json()['text']
    assert question.startswith('Which item is this file for? Reply with its number: 1.')
    answer = post(c, event('MESSAGE', 'nitish@teampulse.local', '2', name='spaces/nitish/messages/31')).json()['text']
    assert answer.startswith('Attached to *Employee document module*')
    with sessions() as db:
        assert db.scalar(select(Attachment)).work_item_id == 1


def test_a_link_pasted_in_app_with_a_commitment_selected_is_stored(ctx):
    c, sessions = ctx
    login(c)
    say(c, 'Draft is at https://figma.com/file/abc123/Deck. 50% complete', work_item_id=1)
    rows = c.get('/api/attachments', params={'work_item_id': 1}).json()['items']
    assert rows[0]['kind'] == 'link' and rows[0]['name'] == 'figma.com/file/abc123/Deck'
    redirect = c.get(rows[0]['open_url'], follow_redirects=False)
    assert redirect.status_code == 302 and redirect.headers['location'] == 'https://figma.com/file/abc123/Deck'


def test_the_file_list_follows_visibility_and_is_newest_first(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    login(c)
    say(c, 'Spec https://example.com/spec-one', work_item_id=1)
    say(c, 'Spec https://example.com/spec-two', work_item_id=12)
    rows = c.get('/api/attachments', params={'team_id': 1, 'person_id': 1}).json()['items']
    assert [r['name'] for r in rows] == ['example.com/spec-two', 'example.com/spec-one']
    page = c.get('/api/attachments', params={'limit': 1}).json()
    rest = c.get('/api/attachments', params={'limit': 1, **page['next']}).json()
    assert page['items'][0]['id'] != rest['items'][0]['id'] and rest['next'] is None
    assert c.get('/api/attachments', params={'kind': 'files'}).json()['items'] == []
    login(c, 'sara')  # Operations: cannot see Engineering's project work
    assert c.get('/api/attachments').json()['items'] == []
    assert c.get(f'/api/attachments/{rows[0]["id"]}/open', follow_redirects=False).status_code == 404


def test_check_in_expiry_dismisses_waiting_proposals(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    action = say(c, '2 is done')['action']
    with sessions() as db:
        ci = db.scalar(select(CheckIn).where(CheckIn.employee_id == 1))
        ci.expires_at = now() - timedelta(minutes=1)
        db.commit()
        proactive.expire_check_ins(db)
        assert db.get(CheckIn, ci.id).status == 'Expired' and db.get(AgentAction, action['id']).status == 'Dismissed'


def test_the_proposal_card_also_moves_the_check_in_on(ctx, on):
    c, sessions = ctx
    with sessions() as db:
        stale(db, 1, 12)
    run(sessions)
    login(c)
    action = say(c, '2 is done')['action']
    assert c.post(f'/api/assistant/actions/{action["id"]}/decide', json={'approve': True}).json()['status'] == 'Approved'
    assert work(c, 1)['status'] == 'Completed'
    assert checkin(sessions, 1).status == 'Open'  # item 1 is still unanswered
