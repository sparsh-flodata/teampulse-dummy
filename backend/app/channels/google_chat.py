"""Google Chat channel: a Chat app that talks to people in direct messages.

Inbound: Google POSTs interaction events to /api/integrations/google-chat/events
with a Google-signed bearer token; `verify_event` checks it before anything is read.

Outbound: messages are queued in `channel_outbox` inside the business transaction
and sent by the workflow tick with the app's service account (scope chat.bot),
to the DM space recorded when the person added or messaged the app.

Nothing here logs tokens, keys or message bodies.
"""
import json
import logging
import threading
import time
from pathlib import Path
import httpx
import jwt
from sqlalchemy import select
from backend.app.core.config import GOOGLE_CHAT_AUDIENCE, GOOGLE_CHAT_ENDPOINT, GOOGLE_CHAT_SERVICE_ACCOUNT_FILE
from backend.app.models import ChatLink, OutboxMessage, UpdateRequest, now
from backend.app.services.formatting import to_google_chat

log = logging.getLogger('teampulse.google_chat')

CHAT_ISSUER = 'chat@system.gserviceaccount.com'
CHAT_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/chat@system.gserviceaccount.com'
GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs'
CHAT_API = 'https://chat.googleapis.com/v1'
SCOPE = 'https://www.googleapis.com/auth/chat.bot'
MAX_ATTEMPTS = 5

_jwks = {}


def inbound_enabled() -> bool:
    return bool(GOOGLE_CHAT_AUDIENCE)


def outbound_enabled() -> bool:
    return bool(GOOGLE_CHAT_SERVICE_ACCOUNT_FILE) and Path(GOOGLE_CHAT_SERVICE_ACCOUNT_FILE).is_file()


def status() -> dict:
    return {'inbound': inbound_enabled(), 'outbound': outbound_enabled()}


# ---- Inbound verification -------------------------------------------------------

def _jwk_client(url: str) -> jwt.PyJWKClient:
    if url not in _jwks:
        _jwks[url] = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwks[url]


def verify_event(authorization: str) -> dict:
    """Verify the bearer token Google sends with every event. Raises jwt.PyJWTError.

    Two styles exist, told apart by the (not yet trusted) issuer, then fully verified:
      classic Chat app, project-number auth: self-signed by chat@system.gserviceaccount.com,
          audience = the project number;
      Workspace add-on style: a Google ID token for service-<project number>@gcp-sa-gsuiteaddons...,
          audience = the endpoint URL set in the Chat API configuration.
    """
    scheme, _, token = (authorization or '').partition(' ')
    if scheme.lower() != 'bearer' or not token:
        raise jwt.InvalidTokenError('missing bearer token')
    issuer = jwt.decode(token, options={'verify_signature': False}).get('iss')
    if issuer == CHAT_ISSUER:
        if not GOOGLE_CHAT_AUDIENCE.isdigit():
            raise jwt.InvalidTokenError('project-number tokens are not enabled')
        key = _jwk_client(CHAT_JWKS).get_signing_key_from_jwt(token)
        return jwt.decode(token, key.key, algorithms=['RS256'], audience=GOOGLE_CHAT_AUDIENCE, issuer=CHAT_ISSUER)
    audience = GOOGLE_CHAT_ENDPOINT if GOOGLE_CHAT_AUDIENCE.isdigit() else GOOGLE_CHAT_AUDIENCE
    senders = {CHAT_ISSUER}
    if GOOGLE_CHAT_AUDIENCE.isdigit():
        senders.add(f'service-{GOOGLE_CHAT_AUDIENCE}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com')
    key = _jwk_client(GOOGLE_JWKS).get_signing_key_from_jwt(token)
    claims = jwt.decode(token, key.key, algorithms=['RS256'], audience=audience,
                        issuer=['https://accounts.google.com', 'accounts.google.com'])
    if claims.get('email') not in senders or not claims.get('email_verified'):
        raise jwt.InvalidTokenError('token was not issued to this Chat app')
    return claims


# ---- Outbound ---------------------------------------------------------------------

class _AppToken:
    """OAuth access token for the app's service account, cached until shortly before expiry."""

    def __init__(self):
        self.lock = threading.Lock()
        self.value, self.expires = '', 0.0

    def get(self) -> str:
        with self.lock:
            if self.value and time.time() < self.expires - 60:
                return self.value
            key = json.loads(Path(GOOGLE_CHAT_SERVICE_ACCOUNT_FILE).read_text(encoding='utf-8'))
            issued = int(time.time())
            token_uri = key.get('token_uri', 'https://oauth2.googleapis.com/token')
            assertion = jwt.encode({'iss': key['client_email'], 'scope': SCOPE, 'aud': token_uri, 'iat': issued, 'exp': issued + 3600},
                                   key['private_key'], algorithm='RS256', headers={'kid': key.get('private_key_id', '')})
            response = httpx.post(token_uri, data={'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': assertion}, timeout=15)
            response.raise_for_status()
            data = response.json()
            self.value, self.expires = data['access_token'], time.time() + int(data.get('expires_in', 3600))
            return self.value


_token = _AppToken()


def send_message(space: str, text: str) -> str:
    """Post a text message to a space the app is a member of. Returns the message name."""
    response = httpx.post(f'{CHAT_API}/{space}/messages', json={'text': to_google_chat(text)},
                          headers={'Authorization': 'Bearer ' + _token.get()}, timeout=15)
    response.raise_for_status()
    return response.json().get('name', '')


def queue_message(db, employee_id: int, text: str, update_request_id: int | None = None,
                  check_in_id: int | None = None, dry_run: bool = False) -> bool:
    """Queue a DM to a linked employee. False when they have not connected Google Chat.

    dry_run stores the message as 'Skipped': it is recorded for review but never sent.
    """
    if not outbound_enabled() or not db.get(ChatLink, employee_id):
        return False
    db.add(OutboxMessage(channel='google_chat', employee_id=employee_id, update_request_id=update_request_id,
                         check_in_id=check_in_id, text=text, status='Skipped' if dry_run else 'Pending'))
    db.flush()
    return True


def media_request(resource_name: str) -> tuple[str, dict]:
    """URL and headers to download an attachment the app received (Chat API media endpoint, chat.bot scope).
    Blocking (the token may be fetched); call it from a worker thread."""
    return f'{CHAT_API}/media/{resource_name}?alt=media', {'Authorization': 'Bearer ' + _token.get()}


def process_outbox(db, sender=send_message) -> int:
    """Send pending Google Chat messages. Called from the workflow tick; returns the number sent."""
    if not outbound_enabled():
        return 0
    sent = 0
    pending = db.scalars(select(OutboxMessage).where(OutboxMessage.channel == 'google_chat', OutboxMessage.status == 'Pending').order_by(OutboxMessage.id).limit(50))
    for message in list(pending):
        link = db.get(ChatLink, message.employee_id)
        request = db.get(UpdateRequest, message.update_request_id) if message.update_request_id else None
        message.attempts += 1
        try:
            if not link:
                raise RuntimeError('The recipient disconnected Google Chat.')
            send_message(link.space, message.text)
            message.status, message.sent_at, message.last_error = 'Sent', now(), ''
            sent += 1
            if request:
                request.delivery_detail = 'Delivered to the TeamPulse update inbox and sent in Google Chat.'
        except (httpx.HTTPError, RuntimeError, KeyError, ValueError) as exc:
            # Keep the error short and free of response bodies (they can echo message text).
            detail = f'HTTP {exc.response.status_code}' if isinstance(exc, httpx.HTTPStatusError) else type(exc).__name__ if not isinstance(exc, RuntimeError) else str(exc)
            message.last_error = detail[:200]
            if message.attempts >= MAX_ATTEMPTS or not link:
                message.status = 'Failed'
                if request:
                    request.delivery_detail = 'Delivered to the TeamPulse update inbox. The Google Chat message could not be sent.'
            log.warning('Google Chat delivery %s failed (attempt %s): %s', message.id, message.attempts, message.last_error)
        db.commit()
    return sent


# ---- Linking -------------------------------------------------------------------------

def is_direct_message(space: dict) -> bool:
    return space.get('type') == 'DM' or space.get('spaceType') == 'DIRECT_MESSAGE' or bool(space.get('singleUserBotDm'))


def link_employee(db, employee, google_user: str, space: str):
    existing = db.scalar(select(ChatLink).where(ChatLink.google_user == google_user))
    if existing and existing.employee_id != employee.id:
        db.delete(existing)
        db.flush()
    link = db.get(ChatLink, employee.id)
    if link:
        link.google_user, link.space = google_user, space
    else:
        db.add(ChatLink(employee_id=employee.id, google_user=google_user, space=space))
    db.flush()


def unlink(db, google_user: str):
    link = db.scalar(select(ChatLink).where(ChatLink.google_user == google_user))
    if link:
        db.delete(link)
        db.flush()
