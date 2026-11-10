"""Files and links people send with an update (plan section 9).

TeamPulse stores references only: Google Chat's attachment reference, a Drive file id, or a URL.
File bytes are never written to TeamPulse's own storage. Uploaded Chat files are streamed from the
Chat API each time someone opens them (see api/routes/attachments.py), because Chat's own links
only open for members of the DM between the employee and the app.
"""
import hashlib
import re
from urllib.parse import urlsplit, urlunsplit
from sqlalchemy import select
from backend.app.models import Attachment, Project, WorkItem, now
from backend.app.services.work import audit

URL = re.compile(r'https://[^\s<>()\[\]{}"\'`|]+', re.I)
TRAILING = '.,;:!?*_'
INLINE_TYPES = ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf')
CHANNEL_LABEL = {'google_chat': 'Google Chat', 'in_app': 'AI chat'}


def _ref(value: str) -> str:
    """A source reference that fits the column; long values are hashed so dedupe still works."""
    return value if len(value) <= 255 else 'sha256:' + hashlib.sha256(value.encode()).hexdigest()


def _https(url: str) -> str:
    return url if isinstance(url, str) and url.lower().startswith('https://') and len(url) < 4000 else ''


def _plain(text: str, limit: int) -> str:
    """Names are shown as plain text; strip control characters and markdown markers."""
    cleaned = re.sub(r'[\x00-\x1f\x7f*`\[\]<>]', '', text or '').strip()
    return cleaned[:limit] or 'file'


def normalize_url(url: str) -> str:
    parts = urlsplit(url)
    path = parts.path.rstrip('/') or ''
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ''))


def link_label(url: str) -> str:
    parts = urlsplit(url)
    host = parts.netloc.lower().removeprefix('www.')
    label = host + (parts.path.rstrip('/') if parts.path not in ('', '/') else '')
    return label if len(label) <= 60 else label[:59] + '…'


def links_in(text: str) -> list[dict]:
    """Every https:// URL in a message, once each, with its position in the text."""
    seen, refs = set(), []
    for match in URL.finditer(text or ''):
        url = match.group(0).rstrip(TRAILING)
        source = _ref(normalize_url(url))
        if source in seen or len(url) < 12:
            continue
        seen.add(source)
        refs.append({'kind': 'link', 'name': _plain(link_label(url), 255), 'content_type': '', 'url': url,
                     'thumbnail_url': '', 'source_ref': source, 'start': match.start()})
    return refs


def chat_files(chat_attachments) -> list[dict]:
    """The files in a Google Chat message (message.attachment[])."""
    refs = []
    for item in chat_attachments or []:
        if not isinstance(item, dict):
            continue
        name = _plain(str(item.get('contentName') or 'file'), 255)
        content_type = str(item.get('contentType') or '')[:120]
        drive = (item.get('driveDataRef') or {}).get('driveFileId')
        upload = (item.get('attachmentDataRef') or {}).get('resourceName')
        if item.get('source') == 'DRIVE_FILE' and drive and re.fullmatch(r'[\w-]{5,200}', str(drive)):
            refs.append({'kind': 'drive_file', 'name': name, 'content_type': content_type,
                         'url': f'https://drive.google.com/open?id={drive}', 'thumbnail_url': '',
                         'source_ref': _ref(str(drive))})
        elif upload and isinstance(upload, str):
            refs.append({'kind': 'chat_upload', 'name': name, 'content_type': content_type,
                         'url': _https(item.get('downloadUri') or ''), 'thumbnail_url': _https(item.get('thumbnailUri') or ''),
                         'source_ref': _ref(upload)})
    return refs


def capture(db, employee, *, refs, chat_message='', work_item_ids, note='', channel='google_chat',
            check_in=None, request=None) -> list[Attachment]:
    """Record each reference against each commitment. A repeat (same commitment, same source) is stored once.
    Only the employee's own, active commitments on live projects are accepted. No commit."""
    created = []
    for work_id in dict.fromkeys(work_item_ids):
        work = db.get(WorkItem, work_id)
        project = db.get(Project, work.project_id) if work else None
        if not work or work.owner_id != employee.id or not project or project.archived:
            continue
        added = []
        for ref in refs:
            exists = db.scalar(select(Attachment.id).where(Attachment.work_item_id == work.id, Attachment.source_ref == ref['source_ref']))
            if exists:
                continue
            row = Attachment(work_item_id=work.id, project_id=work.project_id, employee_id=employee.id,
                             check_in_id=check_in.id if check_in else None, update_request_id=request.id if request else None,
                             kind=ref['kind'], name=ref['name'], content_type=ref.get('content_type', ''), url=ref.get('url', ''),
                             thumbnail_url=ref.get('thumbnail_url', ''), source_ref=ref['source_ref'],
                             chat_message=(chat_message or '')[:255], note=(note or '')[:300], created_at=now())
            db.add(row)
            added.append(row)
        if added:
            db.flush()
            names = ', '.join(r.name for r in added)
            audit(db, employee, f'{employee.name} attached {names} (from {CHANNEL_LABEL.get(channel, "TeamPulse")}).', work.id)
            created.extend(added)
    return created


def can_open(attachment, user) -> bool:
    from backend.app.channels import google_chat
    if attachment.kind in ('link', 'drive_file'):
        return bool(attachment.url)
    return google_chat.outbound_enabled() or (attachment.employee_id == user.id and bool(attachment.url))


def inline_type(content_type: str) -> bool:
    return (content_type or '').lower() in INLINE_TYPES
