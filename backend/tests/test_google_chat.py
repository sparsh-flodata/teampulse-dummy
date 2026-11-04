import time
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select, func
from test_workflows import ctx, login
from backend.app.channels import google_chat
from backend.app.models import ChatLink, OutboxMessage, UpdateRequest
import backend.app.core.security as security

EVENTS = '/api/integrations/google-chat/events'


@pytest.fixture
def chat(ctx, monkeypatch):
    """Google Chat switched on, with Google's signature check stubbed and sends captured."""
    monkeypatch.setattr(security, 'ALLOWED_EMAIL_DOMAINS', ('teampulse.local',))
    monkeypatch.setattr(google_chat, 'GOOGLE_CHAT_AUDIENCE', '123456789')
    monkeypatch.setattr(google_chat, 'outbound_enabled', lambda: True)
    monkeypatch.setattr(google_chat, 'verify_event', lambda header: {'iss': google_chat.CHAT_ISSUER} if header == 'Bearer google' else (_ for _ in ()).throw(jwt.InvalidTokenError()))
    sent = []
    monkeypatch.setattr(google_chat, 'send_message', lambda space, text: sent.append((space, text)) or 'spaces/x/messages/y')
    c, sessions = ctx
    return c, sessions, sent


def event(kind, email, text=None, space_type='DM', name='spaces/m/messages/1'):
    body = {'type': kind, 'user': {'name': 'users/' + email.split('@')[0], 'email': email}, 'space': {'name': 'spaces/' + email.split('@')[0], 'type': space_type}}
    if text is not None:
        body['message'] = {'name': name, 'text': text, 'argumentText': text}
    return body


def post(c, body):
    return c.post(EVENTS, json=body, headers={'Authorization': 'Bearer google', 'X-TeamPulse-Request': ''})


def test_events_require_googles_token(chat):
    c, _, _ = chat
    assert c.post(EVENTS, json=event('MESSAGE', 'rahul@teampulse.local', 'hi'), headers={'X-TeamPulse-Request': ''}).status_code == 401
    assert c.post(EVENTS, json={}, headers={'Authorization': 'Bearer forged'}).status_code == 401


def test_linking_needs_a_registered_company_email_and_a_dm(chat):
    c, sessions, _ = chat
    assert 'couldn’t find an active TeamPulse account' in post(c, event('ADDED_TO_SPACE', 'stranger@gmail.com')).json()['text']
    assert 'Message me directly' in post(c, event('MESSAGE', 'rahul@teampulse.local', 'status?', space_type='ROOM')).json()['text']
    with sessions() as db:
        assert not db.scalar(select(func.count(ChatLink.employee_id)))
    assert 'Connected to TeamPulse as' in post(c, event('ADDED_TO_SPACE', 'rahul@teampulse.local')).json()['text']
    with sessions() as db:
        assert db.get(ChatLink, 2).space == 'spaces/rahul'
    login(c, 'rahul')
    assert c.get('/api/integrations/google-chat').json()['connected'] is True
    post(c, event('REMOVED_FROM_SPACE', 'rahul@teampulse.local'))
    assert c.get('/api/integrations/google-chat').json()['connected'] is False


def test_update_request_goes_out_in_chat_and_the_next_dm_answers_it(chat):
    c, sessions, sent = chat
    post(c, event('ADDED_TO_SPACE', 'rahul@teampulse.local'))
    login(c)
    request = c.post('/api/update-requests', json={'recipient_ids': [2], 'channel': 'google_chat'}).json()[0]
    assert request['status'] == 'Delivered' and 'on its way' in request['delivery_detail']
    with sessions() as db:
        assert google_chat.process_outbox(db) == 1
        assert db.scalar(select(OutboxMessage)).status == 'Sent'
    assert sent[0][0] == 'spaces/rahul' and 'asked for an update' in sent[0][1]
    answer = post(c, event('MESSAGE', 'rahul@teampulse.local', 'About 70% done, the review is tomorrow.', name='spaces/rahul/messages/9'))
    assert answer.json()['text'].startswith('Thanks. I sent your update to')
    # Google retries the same message: it counts once.
    assert post(c, event('MESSAGE', 'rahul@teampulse.local', 'About 70% done, the review is tomorrow.', name='spaces/rahul/messages/9')).json() == answer.json()
    with sessions() as db:
        saved = db.get(UpdateRequest, request['id'])
        assert saved.status == 'Responded' and saved.response.startswith('About 70%')
    # With nothing pending, a message goes to the assistant.
    reply = post(c, event('MESSAGE', 'rahul@teampulse.local', 'What is on my plate?', name='spaces/rahul/messages/10')).json()['text']
    assert reply and 'Thanks. I sent' not in reply


def test_failed_sends_retry_then_stop(chat, monkeypatch):
    c, sessions, _ = chat
    post(c, event('ADDED_TO_SPACE', 'rahul@teampulse.local'))
    login(c)
    c.post('/api/update-requests', json={'recipient_ids': [2], 'channel': 'google_chat'})
    def down(space, text):
        raise google_chat.httpx.ConnectError('down')
    monkeypatch.setattr(google_chat, 'send_message', down)
    with sessions() as db:
        for _ in range(google_chat.MAX_ATTEMPTS):
            google_chat.process_outbox(db)
        message = db.scalar(select(OutboxMessage))
        assert message.status == 'Failed' and message.attempts == google_chat.MAX_ATTEMPTS
        assert 'could not be sent' in db.get(UpdateRequest, message.update_request_id).delivery_detail


def test_verify_event_checks_signature_audience_and_issuer(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    class Keys:
        def get_signing_key_from_jwt(self, token):
            return type('K', (), {'key': key.public_key()})()
    monkeypatch.setattr(google_chat, '_jwk_client', lambda url: Keys())
    monkeypatch.setattr(google_chat, 'GOOGLE_CHAT_AUDIENCE', '123456789')
    sign = lambda **claims: 'Bearer ' + jwt.encode({'iat': int(time.time()), 'exp': int(time.time()) + 60} | claims, key, algorithm='RS256')
    assert google_chat.verify_event(sign(iss=google_chat.CHAT_ISSUER, aud='123456789'))['aud'] == '123456789'
    for bad in (sign(iss=google_chat.CHAT_ISSUER, aud='999'), sign(iss='someone@else', aud='123456789')):
        with pytest.raises(jwt.PyJWTError):
            google_chat.verify_event(bad)
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = 'Bearer ' + jwt.encode({'iss': google_chat.CHAT_ISSUER, 'aud': '123456789', 'exp': int(time.time()) + 60}, other, algorithm='RS256')
    with pytest.raises(jwt.PyJWTError):
        google_chat.verify_event(forged)


def test_workflow_nudges_also_reach_connected_people(chat):
    from backend.app.services.work import notify
    c, sessions, _ = chat
    post(c, event('ADDED_TO_SPACE', 'rahul@teampulse.local'))
    with sessions() as db:
        notify(db, 2, 'overdue:1:1', 'Ship the report is past its expected completion.')
        notify(db, 3, 'overdue:2:1', 'Not connected, so in-app only.')
        db.commit()
        queued = list(db.scalars(select(OutboxMessage)))
        assert [m.employee_id for m in queued] == [2] and queued[0].text.startswith('Ship the report')
