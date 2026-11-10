"""Files and links sent with updates: the list, and opening one (plan 9.3).

Opening goes through TeamPulse, which checks the viewer may see the commitment, then redirects to a link
or Drive file, or streams an uploaded Chat file from the Chat API. Nothing is stored. A new browser tab or an
<img> cannot send the bearer token, so the list hands out short-lived, per-viewer, per-file open links.
These paths are not in PUBLIC_PATHS, so the public tunnel host never serves them.
"""
import asyncio
import re
from datetime import datetime, timedelta
import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session
from backend.app.channels import google_chat
from backend.app.core.config import JWT_SECRET
from backend.app.core.security import ALGORITHM, ISSUER, current_user
from backend.app.db.session import get_db
from backend.app.models import Attachment, Employee, Project, WorkItem, now
from backend.app.services.attachments import can_open, inline_type
from backend.app.services.work import visible_work

router = APIRouter(prefix='/api')

OPEN_TTL = timedelta(minutes=30)
MAX_BYTES = 25 * 1024 * 1024
UPSTREAM_TIMEOUT = 30
UNAVAILABLE = 'Google Chat did not return this file. Ask the sender to share it again.'
KINDS = {'files': ('chat_upload', 'drive_file'), 'links': ('link',), 'chat_upload': ('chat_upload',),
         'drive_file': ('drive_file',), 'link': ('link',)}


def open_token(user, attachment_id: int) -> str:
    issued = now()
    return jwt.encode({'sub': str(user.id), 'att': attachment_id, 'type': 'attachment', 'iss': ISSUER,
                       'iat': issued, 'exp': issued + OPEN_TTL}, JWT_SECRET, algorithm=ALGORITHM)


def serialize_attachments(db, rows, user) -> list[dict]:
    people = {p.id: p for p in db.scalars(select(Employee).where(Employee.id.in_({r.employee_id for r in rows})))} if rows else {}
    works = {w.id: w for w in db.scalars(select(WorkItem).where(WorkItem.id.in_({r.work_item_id for r in rows})))} if rows else {}
    projects = {p.id: p for p in db.scalars(select(Project).where(Project.id.in_({r.project_id for r in rows})))} if rows else {}
    out = []
    for r in rows:
        person, work, project = people.get(r.employee_id), works.get(r.work_item_id), projects.get(r.project_id)
        openable = can_open(r, user)
        url = f'/api/attachments/{r.id}/open?t={open_token(user, r.id)}' if openable else None
        out.append({'id': r.id, 'kind': r.kind, 'name': r.name, 'content_type': r.content_type, 'note': r.note,
                    'created_at': r.created_at.isoformat() + 'Z', 'work_item_id': r.work_item_id, 'project_id': r.project_id,
                    'employee_id': r.employee_id, 'check_in_id': r.check_in_id, 'update_request_id': r.update_request_id,
                    'employee_name': person.name if person else 'Former teammate', 'employee_color': person.color if person else '#5b6f8f',
                    'work_title': work.title if work else '', 'project_name': project.name if project else '',
                    'project_color': project.color if project else '#7256df', 'can_open': openable, 'open_url': url,
                    'thumbnail_url': url if url and r.kind == 'chat_upload' and inline_type(r.content_type) and r.content_type.startswith('image/') else None})
    return out


@router.get('/attachments')
def list_attachments(project_id: int | None = None, team_id: int | None = None, person_id: int | None = None,
                     work_item_id: int | None = None, kind: str | None = None, before: datetime | None = None,
                     before_id: int | None = None, limit: int = Query(50, ge=1, le=100),
                     user: Employee = Depends(current_user), db: Session = Depends(get_db)):
    visible = [w.id for w in visible_work(db, user)]
    q = select(Attachment).where(Attachment.work_item_id.in_(visible))
    if project_id is not None:
        q = q.where(Attachment.project_id == project_id)
    if work_item_id is not None:
        q = q.where(Attachment.work_item_id == work_item_id)
    if person_id is not None:
        if not db.get(Employee, person_id):
            raise HTTPException(404, 'Person not found.')
        q = q.where(Attachment.employee_id == person_id)
    if team_id is not None:
        q = q.where(Attachment.employee_id.in_(select(Employee.id).where(Employee.team_id == team_id)))
    if kind:
        if kind not in KINDS:
            raise HTTPException(422, 'Unknown attachment type.')
        q = q.where(Attachment.kind.in_(KINDS[kind]))
    if before is not None:
        stamp = before.replace(tzinfo=None) if before.tzinfo is None else (before - before.utcoffset()).replace(tzinfo=None)
        q = q.where(or_(Attachment.created_at < stamp, and_(Attachment.created_at == stamp, Attachment.id < (before_id or 0))))
    rows = list(db.scalars(q.order_by(Attachment.created_at.desc(), Attachment.id.desc()).limit(limit + 1)))
    more = len(rows) > limit
    rows = rows[:limit]
    last = rows[-1] if rows else None
    return {'items': serialize_attachments(db, rows, user),
            'next': {'before': last.created_at.isoformat() + 'Z', 'before_id': last.id} if more and last else None}


def _viewer(request: Request, db: Session, attachment_id: int, token: str | None) -> Employee:
    if token:
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM], issuer=ISSUER, options={'require': ['exp', 'sub', 'att']})
        except jwt.PyJWTError:
            raise HTTPException(401, 'This link has expired. Open the file again from TeamPulse.')
        if claims.get('type') != 'attachment' or claims.get('att') != attachment_id or not str(claims['sub']).isdigit():
            raise HTTPException(401, 'This link has expired. Open the file again from TeamPulse.')
        user = db.get(Employee, int(claims['sub']))
        if not user or not user.active:
            raise HTTPException(401, 'Please sign in to continue.')
        return user
    return current_user(request, db)


def _filename(name: str) -> str:
    cleaned = re.sub(r'[^\w.\- ()]', '_', name or 'file').strip() or 'file'
    return cleaned[:120]


@router.get('/attachments/{attachment_id}/open')
async def open_attachment(attachment_id: int, request: Request, t: str | None = None, db: Session = Depends(get_db)):
    user = _viewer(request, db, attachment_id, t)
    row = db.get(Attachment, attachment_id)
    if not row or row.work_item_id not in {w.id for w in visible_work(db, user)}:
        raise HTTPException(404, 'File not found.')
    if row.kind in ('link', 'drive_file'):
        if not row.url.lower().startswith('https://'):
            raise HTTPException(404, 'File not found.')
        return RedirectResponse(row.url, status_code=302)
    if not google_chat.outbound_enabled():
        if row.employee_id == user.id and row.url.lower().startswith('https://'):
            return RedirectResponse(row.url, status_code=302)  # the sender is a member of the DM
        raise HTTPException(502, UNAVAILABLE)
    try:
        url, headers = await asyncio.to_thread(google_chat.media_request, row.source_ref)
    except Exception:
        raise HTTPException(502, UNAVAILABLE)
    client = httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT, follow_redirects=True)
    try:
        upstream = await client.send(client.build_request('GET', url, headers=headers), stream=True)
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(502, UNAVAILABLE)
    declared = upstream.headers.get('content-length')
    if upstream.status_code != 200 or (declared and declared.isdigit() and int(declared) > MAX_BYTES):
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(502, UNAVAILABLE)

    async def body():
        sent = 0
        try:
            async for chunk in upstream.aiter_bytes():
                sent += len(chunk)
                if sent > MAX_BYTES:
                    break
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    inline = inline_type(row.content_type)
    name = _filename(row.name)
    return StreamingResponse(body(), media_type=row.content_type.lower() if inline else 'application/octet-stream', headers={
        'Content-Disposition': f'{"inline" if inline else "attachment"}; filename="{name}"',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, no-store'})
