"""Understanding a reply to a check-in (plan section 7).

The model only extracts. Code decides and speaks: every reply comes from the templates below.

    extract (LLM when configured, else deterministic; the LLM falls back on any failure)
      -> validate (always, on both paths: the cheapest defence against a hallucinated update)
      -> policy (routine numbers apply now; completion, dates and blockers wait for a yes)
      -> reply (templates in the canonical markdown subset, services/formatting.py)

Check-in state lives in CheckIn.pending_json:
    {"answered": [1, 3],                 item numbers that need nothing more this check-in
     "action_ids": [41, 42],             proposals waiting for yes/no (status Confirming)
     "question": {...} | null,           the one open clarification (status Clarifying)
     "queue": [{...}]}                   clarifications to ask after the current one
"""
import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal
import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select, update
from backend.app.core import config
from backend.app.core.config import app_link
from backend.app.models import AgentAction, Dependency, Employee, Project, UpdateRequest, WorkItem, now
from backend.app.schemas import UpdateReply, WorkPatch
from backend.app.services import attachments as files
from backend.app.services.formatting import to_plain
from backend.app.services.work import business_day, latest_commitment, notify, patch_work, today

log = logging.getLogger('teampulse.checkin')

AGENT = 'Check-in agent'
CHANNEL_LABEL = {'google_chat': 'Google Chat', 'in_app': 'AI chat'}


# ---- Extraction schema (shared by both paths) -------------------------------------------

class ItemUpdate(BaseModel):
    n: int                                   # item number from the check-in
    progress: int | None = Field(None, ge=0, le=100)
    remaining_hours: float | None = Field(None, ge=0, le=1000)
    status: Literal['In Progress', 'Completed', 'Blocked'] | None = None
    new_due_date: date | None = None
    reason: str | None = Field(None, max_length=500)       # why a date moved / what blocks
    blocker_person: str | None = Field(None, max_length=120)
    blocker_what: str | None = Field(None, max_length=200)
    skip: bool = False                       # the person said there is nothing new on this item
    evidence: str = Field(max_length=300)    # the exact words in the message this came from


AMBIGUITIES = ('which_item', 'vague_progress', 'hedged_completion', 'date_without_date',
               'slip_without_reason', 'blocker_without_owner', 'none')


class Extraction(BaseModel):
    is_reply: bool                           # false: the person is talking about something else
    updates: list[ItemUpdate] = []
    ambiguity: Literal['which_item', 'vague_progress', 'hedged_completion', 'date_without_date',
                       'slip_without_reason', 'blocker_without_owner', 'none'] = 'none'
    ambiguity_n: int | None = None


# ---- Words ------------------------------------------------------------------------------

_NOT_PLAN = r'(?!\s+(?:by|on|in|before|tomorrow|today|next|this|soon|later)\b)'
COMPLETION = re.compile(r'\b(?:done|finished|completed|shipped|delivered|wrapped up)\b' + _NOT_PLAN
                        + r'|(?<!%)(?<!% )\bcomplete\b' + _NOT_PLAN, re.I)
HEDGE = re.compile(r'\b(?:almost|nearly|not yet|not quite|not (?:done|finished|completed|complete)|mostly|about to|close to|'
                   r'should be|hopefully|probably|will be|soon|isn.t|haven.t|hasn.t|wasn.t|not really)\b', re.I)
PERCENT = re.compile(r'(?<![\d.])(\d{1,3})\s*(?:%|percent\b|pc\b)', re.I)
HOURS = re.compile(r'(?<![\d.])(\d{1,3}(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b\s*(?:of work\s+)?(?:left|remaining|to go|more|needed|pending)\b'
                   r'|\b(?:another|need(?:s)?(?: about| around)?)\s+(\d{1,3}(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b'
                   r'|(?<![\d.])(\d{1,3}(?:\.\d+)?)\s+more\s+(?:h|hrs?|hours?)\b', re.I)
STARTED = re.compile(r'\b(?:started|starting|began|in progress|working on it|picked (?:it )?up)\b', re.I)
BLOCKED = re.compile(r'\b(?:blocked|stuck|waiting (?:on|for)|held up|can.?t (?:continue|proceed|start)|depend(?:s|ing)? on)\b', re.I)
SLIP = re.compile(r'\b(?:late|delay(?:ed)?|slip(?:s|ping|ped)?|push(?:ed)?(?: it)? (?:to|back|out)|mov(?:e|ed|ing)(?: it)? to|'
                  r'reschedul\w*|need (?:more time|until|till)|extend\w*|won.?t make it|not make it|behind schedule|running behind|new date)\b', re.I)
DATE_CUE = re.compile(r'\b(?:move|moved|push|pushed|shift|change|extend|due|deadline|until|till|by)\b', re.I)
REASON = re.compile(r'\b(?:because|since|due to|as (?:the|we|i|our|they|it)|reason(?: is)?:?)\s+(.{3,})', re.I)
SKIP = re.compile(r'\b(?:skip|no change|nothing new|no update|same as (?:before|yesterday))\b', re.I)
QUESTION = re.compile(r'^\s*(?:what|how|who|when|where|why|which|show|list|summari[sz]e|tell me|can you|could you|please (?:show|list|tell))\b|\?\s*$', re.I)
ACK = re.compile(r'^\s*(?:thanks|thank you|thx|ok|okay|cool|great|noted|got it|👍)[\s.!]*$', re.I)
YES = re.compile(r'^\s*(?:yes|y|yep|yeah|confirm|confirmed|correct|ok|okay|sure|👍)[\s.!]*$', re.I)
NO = re.compile(r'^\s*(?:no|n|nope|cancel|wrong|don.t|do not)[\s.!]*$', re.I)
NUMBER_ONLY = re.compile(r'^\s*(?:item\s*|#|no\.?\s*|number\s*)?([1-9])[\s.!)]*$', re.I)
MULTI = re.compile(r'(?:^|(?<=[\s,;.!?(]))([1-9](?:\s*(?:,|and|&)\s*[1-9])+)(?=\s+(?:are|were|both|is|done|finished|completed)\b|\s*[:\-–—])', re.I)
ADDR = re.compile(r'(?:^|(?<=[\s,;.!?(]))(?:item\s*|#|no\.?\s*|number\s*)?([1-9])'
                  r'(?=\s*(?:is\b|was\b|:|\)|=|-(?!\d)|–|—)|\.\s|\s+(?:done|finished|completed|skip|blocked|at|now|still|no change)\b)', re.I)
STOP = {'with', 'from', 'that', 'this', 'into', 'for', 'and', 'the', 'review', 'update', 'work', 'task', 'item', 'final', 'draft', 'module'}
WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']


def parse_date(text: str, base: date) -> date | None:
    """Dates people write in a reply: ISO, today/tomorrow, weekdays, '10 Nov', 'Nov 10', 'next week'."""
    t = text.casefold()
    if m := re.search(r'\b(\d{4})-(\d{2})-(\d{2})\b', t):
        try:
            return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None
    if re.search(r'\bday after tomorrow\b', t):
        return base + timedelta(days=2)
    if re.search(r'\btomorrow\b', t):
        return base + timedelta(days=1)
    if re.search(r'\b(?:today|eod|end of (?:the )?day)\b', t):
        return base
    if re.search(r'\bnext week\b', t):
        return base + timedelta(days=7 - base.weekday())
    if re.search(r'\b(?:end of (?:the )?week|eow)\b', t):
        return base + timedelta(days=max(0, 4 - base.weekday()))
    month = r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?'
    m = re.search(r'\b(\d{1,2})(?:st|nd|rd|th)?\s+' + month, t) or re.search(r'\b' + month + r'\s+(\d{1,2})(?:st|nd|rd|th)?\b', t)
    if m:
        day, mon = (m[1], m[2]) if m[1].isdigit() else (m[2], m[1])
        try:
            found = date(base.year, MONTHS.index(mon[:3]) + 1, int(day))
        except ValueError:
            return None
        return found.replace(year=base.year + 1) if (base - found).days > 60 else found
    for i, name in enumerate(WEEKDAYS):
        if re.search(r'\b' + name[:3] + r'(?:' + name[3:] + r')?\b', t):
            ahead = (i - base.weekday()) % 7 or 7
            return base + timedelta(days=ahead)
    return None


def short_date(d: date, base: date | None = None) -> str:
    base = base or today()
    if d == base:
        return 'today'
    if d == base + timedelta(days=1):
        return 'tomorrow'
    if d == base - timedelta(days=1):
        return 'yesterday'
    return f'{d:%a} {d.day} {d:%b}'


def _collapse(text: str) -> str:
    return re.sub(r'\s+', ' ', text or '').strip().casefold()


def _md(text: str) -> str:
    """Titles go inside **bold**; drop characters that would break the markup."""
    return re.sub(r'[*`_\[\]]', '', text or '').strip()


def _fmt_hours(value: float) -> str:
    return f'{value:g}'


# ---- Check-in state ------------------------------------------------------------------------

@dataclass
class Thread:
    check_in: object
    items: list[dict]
    pending: dict = field(default_factory=dict)

    @classmethod
    def load(cls, check_in):
        pending = json.loads(check_in.pending_json or '{}')
        pending.setdefault('answered', [])
        pending.setdefault('action_ids', [])
        pending.setdefault('question', None)
        pending.setdefault('queue', [])
        return cls(check_in, json.loads(check_in.items_json or '[]'), pending)

    def item(self, n):
        return next((i for i in self.items if i['n'] == n), None)

    def save(self):
        p = self.pending
        p['type'] = 'confirm' if p['action_ids'] else 'clarify' if p['question'] else 'none'
        if p['question']:
            p['ambiguity'], p['n'] = p['question'].get('ambiguity'), p['question'].get('n')
        else:
            p.pop('ambiguity', None)
            p.pop('n', None)
        self.check_in.pending_json = json.dumps(p, default=str)
        self.check_in.last_message_at = now()
        if p['action_ids']:
            self.check_in.status = 'Confirming'
        elif p['question']:
            self.check_in.status = 'Clarifying'
        elif all(i['n'] in p['answered'] for i in self.items):
            self.check_in.status = 'Done'
        else:
            self.check_in.status = 'Open'


def item_title(db, item) -> str:
    if item.get('dependency_id'):
        dep = db.get(Dependency, item['dependency_id'])
        if dep:
            return _md(dep.deliverable)
    work = db.get(WorkItem, item['work_item_id'])
    return _md(work.title) if work else 'that item'


def short_title(title: str, limit: int = 60) -> str:
    return title if len(title) <= limit else title[:limit - 1].rstrip() + '…'


def item_list(db, items) -> str:
    return ', '.join(f'{i["n"]}. {short_title(item_title(db, i), 40)}' for i in items)


# ---- Deterministic extraction ------------------------------------------------------------

def _people(db, employee):
    return list(db.scalars(select(Employee).where(Employee.active.is_(True), Employee.id != employee.id)))


def _person_in(text: str, people) -> tuple[Employee | None, re.Match | None]:
    lowered = text.casefold()
    full = [p for p in people if re.search(r'(?<!\w)' + re.escape(p.name.casefold()) + r'(?!\w)', lowered)]
    if len(full) == 1:
        return full[0], re.search(re.escape(full[0].name), text, re.I)
    first = [p for p in people if re.search(r'(?<!\w)' + re.escape(p.name.split()[0].casefold()) + r'(?!\w)', lowered)]
    if len(first) == 1 and not full:
        return first[0], re.search(r'(?<!\w)' + re.escape(first[0].name.split()[0]) + r'(?!\w)', text, re.I)
    return None, None


def _blocker_what(text: str, after: int = 0) -> str | None:
    tail = text[after:]
    m = re.search(r'\b(?:waiting (?:on|for)|blocked (?:on|by)|stuck on|depend(?:s|ing)? on|held up by)\s+(.+)', tail, re.I) if not after else None
    tail = m.group(1) if m else tail
    tail = re.sub(r'^\W*(?:for|to send|to deliver|to share|on)?\s*(?:the|a|an)?\s+', '', ' ' + tail, flags=re.I)
    tail = re.split(r'(?<=[a-z0-9)])[.;!?](?:\s|$)', tail)[0]
    tail = re.sub(r'\s+by\s+\S+.*$', '', tail, flags=re.I).strip(' .!,')
    return tail[:200] if len(tail) >= 3 else None


def _reason(text: str) -> str | None:
    m = REASON.search(text)
    if m:
        return m.group(1).strip(' .!')[:500]
    m = re.search(r'\b(?:waiting (?:on|for)|blocked (?:on|by))\s+(.{3,})', text, re.I)
    if m:
        return m.group(0).strip(' .!')[:500]
    m = re.search(r'[:\-–—]\s*([^:\-–—]{3,})$', text)
    if m and not re.fullmatch(r'[\d\s%.,h]+', m.group(1)):
        return m.group(1).strip(' .!')[:500]
    return None


@dataclass
class Parsed:
    extraction: Extraction
    segments: list[tuple[frozenset, int, int]] = field(default_factory=list)  # (item numbers, start, end)
    pending_update: dict | None = None   # which_item: what was said, waiting for the item number


def _signals(text: str) -> bool:
    return bool(PERCENT.search(text) or HOURS.search(text) or COMPLETION.search(text) or BLOCKED.search(text)
                or SLIP.search(text) or SKIP.search(text) or STARTED.search(text) or HEDGE.search(text))


def _parse_segment(db, employee, n: int, text: str, work, base: date) -> tuple[ItemUpdate | None, str, dict]:
    """One item's part of a message -> (update, ambiguity, extra state)."""
    evidence = text.strip()[:300]
    fields: dict = {}
    if m := PERCENT.search(text):
        fields['progress'] = int(m[1])
    if m := HOURS.search(text):
        fields['remaining_hours'] = float(next(g for g in m.groups() if g))
    if SKIP.search(text):
        fields['skip'] = True
    completion = COMPLETION.search(text)
    if completion and HEDGE.search(text):
        return (ItemUpdate(n=n, evidence=evidence, **{k: v for k, v in fields.items() if k != 'skip'}) if fields.keys() - {'skip'} else None,
                'hedged_completion', {})
    if completion:
        fields['status'] = 'Completed'
    elif STARTED.search(text) or ('progress' in fields and work and work.status == 'Planned'):
        fields['status'] = 'In Progress'
    if BLOCKED.search(text) and not completion:
        fields['status'] = 'Blocked'
        person, mention = _person_in(text, _people(db, employee))
        if person:
            fields['blocker_person'] = person.name
            fields['blocker_what'] = _blocker_what(text, mention.end())
        else:
            fields['blocker_what'] = _blocker_what(text)
        if not person and not fields.get('blocker_what'):
            fields.pop('status')
            return (ItemUpdate(n=n, evidence=evidence, **fields) if fields else None), 'blocker_without_owner', {}
    current_due = latest_commitment(db, work.id).due_date if work else None
    when = parse_date(text, base)
    slip = SLIP.search(text)
    if when and (slip or DATE_CUE.search(text)) and when != current_due:
        fields['new_due_date'] = when
        reason = _reason(text)
        if reason:
            fields['reason'] = reason
        update = ItemUpdate(n=n, evidence=evidence, **fields)
        return update, ('slip_without_reason' if not reason else 'none'), {}
    if slip and not when:
        return (ItemUpdate(n=n, evidence=evidence, **fields) if fields else None), 'date_without_date', {}
    if not fields:
        return None, 'vague_progress', {}
    return ItemUpdate(n=n, evidence=evidence, **fields), 'none', {}


def _title_match(db, items, sentence: str) -> int | None:
    words = set(re.findall(r'[a-z0-9]+', sentence.casefold()))
    scores = {}
    for item in items:
        significant = {w for w in re.findall(r'[a-z0-9]+', item_title(db, item).casefold()) if len(w) >= 4 and w not in STOP}
        score = len(significant & words)
        if score:
            scores[item['n']] = score
    if not scores:
        return None
    best = max(scores.values())
    top = [n for n, s in scores.items() if s == best]
    return top[0] if len(top) == 1 else None


def deterministic_extract(db, employee, thread: Thread, text: str, focus: int | None = None) -> Parsed:
    base = today()
    items = thread.items
    numbers = {i['n'] for i in items}
    markers = []
    for m in MULTI.finditer(text):
        ns = frozenset(int(x) for x in re.findall(r'[1-9]', m.group(1)) if int(x) in numbers)
        if ns:
            markers.append((m.start(), m.end(), ns))
    for m in ADDR.finditer(text):
        n = int(m.group(1))
        if n in numbers and not any(s <= m.start() < e for s, e, _ in markers):
            markers.append((m.start(), m.end(), frozenset({n})))
    if re.search(r'\b(?:all|everything|both)\b.{0,20}\b(?:done|finished|completed)\b', text, re.I) and not HEDGE.search(text) and not markers:
        markers.append((0, 0, frozenset(numbers)))
    markers.sort()

    # Text before the first marker, or the whole message when nothing is numbered.
    chunks: list[tuple[frozenset | None, int, int]] = []
    first = markers[0][0] if markers else len(text)
    if text[:first].strip():
        chunks.append((None, 0, first))
    for i, (start, end, ns) in enumerate(markers):
        stop = markers[i + 1][0] if i + 1 < len(markers) else len(text)
        chunks.append((ns, start, stop))

    updates: dict[int, ItemUpdate] = {}
    ambiguity, ambiguity_n, pending_update = 'none', None, None
    segments = []

    def merge(update: ItemUpdate):
        if update.n in updates:
            current = updates[update.n].model_dump()
            for k, v in update.model_dump().items():
                if k == 'evidence':
                    continue
                if v not in (None, False):
                    current[k] = v
            current['evidence'] = updates[update.n].evidence
            updates[update.n] = ItemUpdate(**current)
        else:
            updates[update.n] = update

    def note(kind, n):
        nonlocal ambiguity, ambiguity_n
        if ambiguity == 'none' and kind != 'none':
            ambiguity, ambiguity_n = kind, n

    for ns, start, stop in chunks:
        piece = text[start:stop]
        if ns is None:
            if not _signals(piece) and not PERCENT.search(piece) and (len(items) > 1 and focus is None):
                if piece.strip() and not markers:
                    note('vague_progress', None)
                continue
            if len(items) == 1:
                target = {items[0]['n']}
            elif focus in numbers:
                target = {focus}
            else:
                # Sentence by sentence: a title word decides the item, otherwise it is unclear.
                target = set()
                for sm in re.finditer(r'[^.;!?\n]+(?:[.;!?\n]+|$)', piece):
                    sentence = sm.group(0)
                    if not sentence.strip():
                        continue
                    n = _title_match(db, items, sentence)
                    if n:
                        work = db.get(WorkItem, thread.item(n)['work_item_id'])
                        update, kind, _ = _parse_segment(db, employee, n, sentence, work, base)
                        if update:
                            merge(update)
                        note(kind, n)
                        segments.append((frozenset({n}), start + sm.start(), start + sm.end()))
                    elif _signals(sentence):
                        update, kind, _ = _parse_segment(db, employee, 0, sentence, None, base)
                        if ambiguity == 'none':
                            ambiguity, ambiguity_n = 'which_item', None
                            pending_update = update.model_dump(mode='json') if update else None
                continue
            ns = frozenset(target)
        segments.append((ns, start, stop))
        for n in sorted(ns):
            work = db.get(WorkItem, thread.item(n)['work_item_id'])
            update, kind, _ = _parse_segment(db, employee, n, piece, work, base)
            if update:
                merge(update)
            note(kind, n)
    is_reply = bool(updates) or ambiguity != 'none' or bool(markers)
    if not is_reply:
        is_reply = not (QUESTION.search(text) or ACK.match(text))
        if is_reply:
            ambiguity = 'vague_progress'
    elif QUESTION.search(text) and not updates and not markers:
        is_reply = False
    return Parsed(Extraction(is_reply=is_reply, updates=list(updates.values()), ambiguity=ambiguity, ambiguity_n=ambiguity_n),
                  segments, pending_update)


# ---- LLM extraction --------------------------------------------------------------------------

def _llm_settings():
    return tuple(os.getenv(k, '') for k in ('AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY'))


async def llm_extract(db, employee, thread: Thread, text: str, history: list[dict], focus: int | None) -> Extraction | None:
    """Groq/OpenAI-compatible JSON mode, temperature 0, 20s timeout. None when not configured."""
    base, model, key = _llm_settings()
    if not all((base, model, key)):
        return None
    facts = []
    for item in thread.items:
        work = db.get(WorkItem, item['work_item_id'])
        c = latest_commitment(db, work.id) if work else None
        facts.append({'n': item['n'], 'title': item_title(db, item), 'status': work.status if work else None,
                      'progress': work.progress if work else None, 'remaining_hours': work.remaining_hours if work else None,
                      'due_date': str(c.due_date) if c else None})
    system = ('You read one person\'s reply to a work check-in and extract updates. Respond with ONLY JSON matching this schema: '
              + json.dumps(Extraction.model_json_schema())
              + '\nRules: Extract only what the person explicitly said. Never infer completion from tone. "Almost done" is not Completed. '
              'If the item is unclear and there is more than one, set ambiguity=which_item. Copy the words you relied on into evidence. '
              'Use status Blocked only when they say they are waiting on someone or something. '
              'Set is_reply=false when the message is not about these items. '
              + (f'The person is answering a question about item {focus}. ' if focus else '')
              + 'Today: ' + str(today()) + '. Items: ' + json.dumps(facts))
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(base.rstrip('/') + '/chat/completions', headers={'Authorization': 'Bearer ' + key},
                                     json={'model': model, 'temperature': 0, 'response_format': {'type': 'json_object'},
                                           'messages': [{'role': 'system', 'content': system}] + history[-6:] + [{'role': 'user', 'content': text}]})
        response.raise_for_status()
        return Extraction.model_validate_json(response.json()['choices'][0]['message']['content'])


# ---- Validation (always) ---------------------------------------------------------------------

def _literal(number, message: str) -> bool:
    candidates = {f'{number:g}'} if isinstance(number, float) else {str(number)}
    if isinstance(number, float) and number.is_integer():
        candidates |= {str(int(number)), f'{number:.1f}'}
    return any(re.search(r'(?<![\d.])' + re.escape(c) + r'(?![\d])', message) for c in candidates)


def validate(db, employee, thread: Thread, extraction: Extraction, message: str) -> Extraction:
    """Drop every update that fails a check. If all are dropped, the reply is vague."""
    base = today()
    collapsed = _collapse(message)
    kept, ambiguity, ambiguity_n = [], extraction.ambiguity, extraction.ambiguity_n
    for u in extraction.updates:
        item = thread.item(u.n)
        work = db.get(WorkItem, item['work_item_id']) if item else None
        project = db.get(Project, work.project_id) if work else None
        if not item or not work or work.owner_id != employee.id or work.status == 'Completed' or not project or project.archived:
            continue
        if item.get('dependency_id'):
            dep = db.get(Dependency, item['dependency_id'])
            if not dep or dep.owner_id != employee.id:
                continue
        if not u.evidence or _collapse(u.evidence) not in collapsed:
            continue
        data = u.model_dump()
        if u.progress is not None and not _literal(u.progress, message):
            data['progress'] = None
        if u.remaining_hours is not None and not _literal(u.remaining_hours, message):
            data['remaining_hours'] = None
        if u.status == 'Completed':
            context = u.evidence
            if not COMPLETION.search(context) or HEDGE.search(context):
                data['status'] = None
                if ambiguity == 'none':
                    ambiguity, ambiguity_n = 'hedged_completion', u.n
        if u.new_due_date is not None and u.new_due_date < base:
            data['new_due_date'] = None
        if u.status == 'Blocked' and not (u.blocker_person or u.blocker_what):
            data['status'] = None
        cleaned = ItemUpdate(**data)
        if any(v is not None for v in (cleaned.progress, cleaned.remaining_hours, cleaned.status, cleaned.new_due_date)) or cleaned.skip:
            kept.append(cleaned)
    if extraction.updates and not kept and ambiguity == 'none':
        ambiguity, ambiguity_n = 'vague_progress', None
    if ambiguity not in AMBIGUITIES:
        ambiguity = 'none'
    if ambiguity_n is not None and not thread.item(ambiguity_n):
        ambiguity_n = None
    return Extraction(is_reply=extraction.is_reply, updates=kept, ambiguity=ambiguity, ambiguity_n=ambiguity_n)


# ---- Templates -------------------------------------------------------------------------------

def question_text(db, thread: Thread, q: dict) -> str:
    kind, n = q['ambiguity'], q.get('n')
    item = thread.item(n) if n else None
    if not item:
        open_items = [i for i in thread.items if i['n'] not in thread.pending['answered']] or thread.items
        item = open_items[0]
    title = short_title(item_title(db, item))
    if kind in ('which_item', 'which_item_for_file'):
        what = 'this file' if kind == 'which_item_for_file' else 'that'
        return f'Which item is {what} for? Reply with its number: {item_list(db, thread.items)}' if kind == 'which_item_for_file' \
            else f'Which one is that about? Reply with its number: {item_list(db, thread.items)}'
    if kind == 'vague_progress':
        return f'Roughly how far along is **{title}**? A percent or hours left is enough, like "60%, 3h left".'
    if kind == 'hedged_completion':
        return f'I\'ll keep **{title}** open. What\'s left, and about how many hours?'
    if kind == 'date_without_date':
        return f'What date should **{title}** move to?'
    if kind == 'slip_without_reason':
        when = date.fromisoformat(q['date']) if q.get('date') else None
        lead = f'Got it, {short_date(when)}. ' if when else ''
        return lead + 'What changed? One line is fine; your manager sees it with the new date.'
    if kind == 'blocker_without_owner':
        return f'Who or what is **{title}** waiting on?'
    return ''


def _summary(work, before: dict) -> str:
    parts = []
    if work.progress != before['progress']:
        parts.append(f'{work.progress}%')
    if work.remaining_hours != before['remaining_hours']:
        parts.append(f'{_fmt_hours(work.remaining_hours)}h left')
    if work.status != before['status']:
        parts.append(work.status.lower())
    return ', '.join(parts) or 'confirmed'


def proposal_line(db, payload: dict) -> str:
    work = db.get(WorkItem, payload.get('work_item_id'))
    title = short_title(_md(work.title)) if work else 'that item'
    if payload['kind'] == 'dependency':
        owner = db.get(Employee, payload.get('owner_id'))
        return f'Record that **{title}** is waiting on {owner.name if owner else "them"} for "{_md(payload.get("deliverable") or "")}"'
    if payload.get('due_date'):
        return f'Move **{title}** to {short_date(date.fromisoformat(str(payload["due_date"])))} ({_md(payload.get("note", ""))[:120]})'
    if payload.get('status') == 'Completed':
        return f'Mark **{title}** as done'
    if payload.get('risk'):
        return f'Flag **{title}** as at risk: {_md(payload.get("note", ""))[:120]}'
    return f'Update **{title}**'


def confirm_text(db, actions) -> str:
    lines = [proposal_line(db, json.loads(a.payload)) for a in actions]
    if len(lines) == 1:
        return lines[0] + '? Reply `yes` or `no`.'
    return 'Confirm these? Reply `yes` or `no`.\n' + '\n'.join('- ' + line for line in lines)


def finish_text() -> str:
    link = app_link('/my-work')
    return 'Thanks, I saved what I could. Anything else, update it in TeamPulse' + (f': [Open TeamPulse]({link})' if link else '.')


# ---- Policy and apply ------------------------------------------------------------------------

def _snapshot(db, work):
    from backend.app.services.assistant import snapshot
    return snapshot(db, work)


def _proposal(**kwargs):
    from backend.app.services.assistant import Proposal
    return Proposal(**kwargs)


def _note(employee, channel, evidence):
    return f'Updated by the assistant from {employee.name}\'s check-in reply ({CHANNEL_LABEL.get(channel, "TeamPulse")}): "{evidence[:200]}"'


@dataclass
class Turn:
    saved: list[str] = field(default_factory=list)
    attached: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    applied_ids: list[int] = field(default_factory=list)
    proposed: list = field(default_factory=list)


def apply_updates(db, employee, thread: Thread, updates: list[ItemUpdate], channel: str, turn: Turn, questions: list[dict]):
    stamp = now()
    for u in updates:
        item = thread.item(u.n)
        work = db.get(WorkItem, item['work_item_id'])
        if u.skip and not any(v is not None for v in (u.progress, u.remaining_hours, u.status, u.new_due_date)):
            thread.pending['answered'].append(u.n)
            continue
        routine = {k: v for k, v in (('progress', u.progress), ('remaining_hours', u.remaining_hours),
                                    ('status', 'In Progress' if u.status == 'In Progress' and work.status in ('Planned',) else None)) if v is not None}
        if routine:
            before = _snapshot(db, work)
            patch_work(db, employee, work, WorkPatch(note=_note(employee, channel, u.evidence), **routine))
            after = _snapshot(db, work)
            payload = _proposal(kind='update', work_item_id=work.id, note=u.evidence, **{k: v for k, v in routine.items()})
            action = AgentAction(employee_id=employee.id, payload=payload.model_dump_json(), source='checkin', status='Applied',
                                 applied_at=stamp, check_in_id=thread.check_in.id,
                                 base_snapshot=json.dumps({'before': before, 'after': after}))
            db.add(action)
            db.flush()
            turn.applied_ids.append(action.id)
            turn.saved.append(f'**{short_title(_md(work.title))}**: {_summary(work, before)}')
        proposals = []
        if u.status == 'Completed':
            proposals.append(_proposal(kind='update', work_item_id=work.id, status='Completed',
                                       note=f'Completed, from {employee.name}\'s check-in reply: "{u.evidence[:200]}"'))
        if u.new_due_date:
            if u.reason and len(u.reason.strip()) >= 3:
                proposals.append(_proposal(kind='update', work_item_id=work.id, due_date=u.new_due_date, note=u.reason.strip()[:500]))
            else:
                questions.append({'ambiguity': 'slip_without_reason', 'n': u.n, 'date': str(u.new_due_date)})
        if u.status == 'Blocked':
            person = None
            if u.blocker_person:
                person, _ = _person_in(u.blocker_person, _people(db, employee))
            if person:
                deliverable = (u.blocker_what or f'Input needed for {work.title}')[:200]
                if len(deliverable) < 3:
                    deliverable = f'Input needed for {work.title}'[:200]
                proposals.append(_proposal(kind='dependency', work_item_id=work.id, owner_id=person.id, deliverable=deliverable,
                                           due_date=business_day(today(), 2), partial=True, note=u.evidence[:2000]))
            elif u.blocker_what:
                proposals.append(_proposal(kind='update', work_item_id=work.id, risk=True, note=f'Waiting on {u.blocker_what}'[:500]))
            else:
                questions.append({'ambiguity': 'blocker_without_owner', 'n': u.n})
        if proposals:
            # A newer answer about the same item replaces a suggestion still waiting for a yes.
            for old in _pending_actions(db, thread):
                if json.loads(old.payload).get('work_item_id') == work.id and _same_kind(json.loads(old.payload), proposals):
                    old.status = 'Dismissed'
                    thread.pending['action_ids'].remove(old.id)
            base = json.dumps(_snapshot(db, work))
            for p in proposals:
                action = AgentAction(employee_id=employee.id, payload=p.model_dump_json(), source='checkin', status='Proposed',
                                     check_in_id=thread.check_in.id, base_snapshot=base if p.kind == 'update' else '{}')
                db.add(action)
                db.flush()
                thread.pending['action_ids'].append(action.id)
                turn.proposed.append(action)
        if routine or u.skip or (not proposals and not any(q.get('n') == u.n for q in questions)):
            if u.n not in thread.pending['answered']:
                thread.pending['answered'].append(u.n)


def _same_kind(old: dict, proposals) -> bool:
    for p in proposals:
        if p.kind == old.get('kind') and bool(p.due_date) == bool(old.get('due_date')) and (p.status == old.get('status')):
            return True
    return False


def _pending_actions(db, thread: Thread):
    ids = thread.pending['action_ids']
    return list(db.scalars(select(AgentAction).where(AgentAction.id.in_(ids), AgentAction.status == 'Proposed'))) if ids else []


def _manager_notice(db, employee, payload: dict, action_id: int):
    """A confirmed date slip or new blocker is told to the person's manager."""
    if not employee.manager_id:
        return
    work = db.get(WorkItem, payload.get('work_item_id'))
    if not work:
        return
    first = employee.name.split()[0]
    title = _md(work.title)
    if payload['kind'] == 'dependency':
        owner = db.get(Employee, payload.get('owner_id'))
        text = f'{first} recorded that **{title}** is waiting on {owner.name if owner else "a teammate"}: {_md(payload.get("deliverable", ""))}.'
    elif payload.get('due_date'):
        text = f'{first} moved **{title}** to {short_date(date.fromisoformat(str(payload["due_date"])))}: {_md(payload.get("note", ""))}'
    elif payload.get('risk'):
        text = f'{first} flagged **{title}** as at risk: {_md(payload.get("note", ""))}'
    else:
        return
    text = text.rstrip('.') + '.'
    notify(db, employee.manager_id, f'checkin-escalation:{action_id}', to_plain(text), work.id)
    from backend.app.channels import google_chat
    google_chat.queue_message(db, employee.manager_id, text)


def _resolve(db, employee, thread: Thread, actions, approve: bool) -> list[str]:
    from backend.app.services.assistant import apply_proposal
    lines = []
    for action in actions:
        claimed = db.execute(update(AgentAction).where(AgentAction.id == action.id, AgentAction.status == 'Proposed').values(status='Processing')).rowcount
        if action.id in thread.pending['action_ids']:
            thread.pending['action_ids'].remove(action.id)
        if not claimed:
            continue
        payload = json.loads(action.payload)
        n = next((i['n'] for i in thread.items if i['work_item_id'] == payload.get('work_item_id')), None)
        if approve:
            try:
                with db.begin_nested():
                    apply_proposal(db, employee, action)
                action.status = 'Approved'
                lines.append(proposal_line(db, payload).replace('Mark ', 'Marked ', 1).replace('Move ', 'Moved ', 1)
                             .replace('Record that', 'Recorded that', 1).replace('Flag ', 'Flagged ', 1))
                _manager_notice(db, employee, payload, action.id)
            except HTTPException as exc:
                action.status = 'Dismissed'
                lines.append(f'Couldn\'t save it: {exc.detail}')
        else:
            action.status = 'Rejected'
        if n and n not in thread.pending['answered']:
            thread.pending['answered'].append(n)
    return lines


def resolve_confirmation(db, employee, check_in, approve: bool) -> str:
    """A yes or no in reply to the open confirmation."""
    thread = Thread.load(check_in)
    lines = _resolve(db, employee, thread, _pending_actions(db, thread), approve)
    thread.pending['action_ids'] = []
    parts = []
    if approve:
        parts.append('Done:\n' + '\n'.join('- ' + line for line in lines) if lines else 'That was already handled.')
    else:
        parts.append('OK, I left it as it was.')
    parts += _next_question(db, thread)
    thread.save()
    return '\n\n'.join(p for p in parts if p)


def after_card_decision(db, employee, action, approve: bool):
    """A Confirm/Dismiss on the in-app ProposalCard for a check-in proposal (the card already applied it)."""
    check_in = _get_check_in(db, action.check_in_id)
    if not check_in:
        return
    thread = Thread.load(check_in)
    if action.id in thread.pending['action_ids']:
        thread.pending['action_ids'].remove(action.id)
    payload = json.loads(action.payload)
    n = next((i['n'] for i in thread.items if i['work_item_id'] == payload.get('work_item_id')), None)
    if n and n not in thread.pending['answered']:
        thread.pending['answered'].append(n)
    if approve:
        _manager_notice(db, employee, payload, action.id)
    if not thread.pending['action_ids'] and thread.pending['question'] and not thread.pending['question'].get('asked'):
        from backend.app.models import Conversation
        text = _next_question(db, thread)
        if text:
            db.add(Conversation(employee_id=employee.id, role='assistant', message=text[0], agent=AGENT))
    thread.save()


def _get_check_in(db, check_in_id):
    from backend.app.models import CheckIn
    return db.get(CheckIn, check_in_id) if check_in_id else None


def _next_question(db, thread: Thread) -> list[str]:
    """Ask the open clarification (one at a time), or close after two rounds."""
    q = thread.pending['question']
    if not q and thread.pending['queue']:
        q = thread.pending['question'] = thread.pending['queue'].pop(0)
    if not q or q.get('asked'):
        return []
    check_in = thread.check_in
    if check_in.clarify_rounds >= 2:
        thread.pending['question'], thread.pending['queue'] = None, []
        thread.pending['answered'] = [i['n'] for i in thread.items]
        thread.pending['files'] = []
        return [finish_text()]
    check_in.clarify_rounds += 1
    q['asked'] = True
    return [question_text(db, thread, q)]


# ---- Undo ---------------------------------------------------------------------------------------

def undo(db, employee) -> str:
    since = now() - timedelta(minutes=config.UNDO_WINDOW_MINUTES)
    latest = db.scalar(select(AgentAction).where(AgentAction.employee_id == employee.id, AgentAction.source == 'checkin',
                                                 AgentAction.status == 'Applied', AgentAction.applied_at >= since)
                       .order_by(AgentAction.applied_at.desc(), AgentAction.id.desc()).limit(1))
    if not latest:
        return f'There\'s nothing to undo from the last {config.UNDO_WINDOW_MINUTES // 60 or config.UNDO_WINDOW_MINUTES} hours.' \
            if config.UNDO_WINDOW_MINUTES >= 60 else 'There\'s nothing recent to undo.'
    group = list(db.scalars(select(AgentAction).where(AgentAction.employee_id == employee.id, AgentAction.source == 'checkin',
                                                      AgentAction.status == 'Applied', AgentAction.applied_at == latest.applied_at)
                            .order_by(AgentAction.id)))
    restored, moved = [], []
    for action in group:
        payload = json.loads(action.payload)
        work = db.get(WorkItem, payload.get('work_item_id'))
        states = json.loads(action.base_snapshot or '{}')
        before, after = states.get('before'), states.get('after')
        if not work or not before or not after:
            continue
        title = short_title(_md(work.title))
        if work.owner_id != employee.id or _snapshot(db, work) != after:
            moved.append(f'**{title}**')
            continue
        changes = {k: before[k] for k in ('progress', 'remaining_hours', 'status') if before[k] != after[k]}
        patch_work(db, employee, work, WorkPatch(note='Undone from check-in', **changes))
        action.status = 'Undone'
        restored.append(f'**{title}**: back to {before["progress"]}%, {_fmt_hours(before["remaining_hours"])}h left')
    parts = []
    if restored:
        parts.append('Undone:\n' + '\n'.join('- ' + r for r in restored))
    if moved:
        parts.append(', '.join(moved) + ' changed since then, so I left ' + ('it' if len(moved) == 1 else 'them') + ' as ' + ('it is.' if len(moved) == 1 else 'they are.'))
    return '\n\n'.join(parts) or 'There\'s nothing to undo.'


def undo_available(db, employee) -> bool:
    since = now() - timedelta(minutes=config.UNDO_WINDOW_MINUTES)
    return bool(db.scalar(select(AgentAction.id).where(AgentAction.employee_id == employee.id, AgentAction.source == 'checkin',
                                                       AgentAction.status == 'Applied', AgentAction.applied_at >= since).limit(1)))


# ---- The turn ---------------------------------------------------------------------------------------

def _history(db, employee, check_in) -> list[dict]:
    from backend.app.models import Conversation
    rows = list(db.scalars(select(Conversation).where(Conversation.employee_id == employee.id, Conversation.created_at >= check_in.created_at)
                           .order_by(Conversation.id.desc()).limit(6)))[::-1]
    return [{'role': r.role, 'content': r.message} for r in rows]


def _file_targets(thread: Thread, parsed: Parsed | None, extraction: Extraction, refs: list[dict], focus) -> dict[int, list[dict]] | None:
    """Which commitment each file or link belongs to; None when it cannot be told (ask)."""
    touched = [u.n for u in extraction.updates]
    named = sorted({n for ns, _, _ in (parsed.segments if parsed else []) for n in ns} | set(touched))
    targets: dict[int, list[dict]] = {}
    for ref in refs:
        chosen = None
        if ref['kind'] == 'link':
            if parsed:
                hits = [ns for ns, start, stop in parsed.segments if start <= ref.get('start', -1) < stop]
                if hits and len(hits[0]) >= 1:
                    chosen = sorted(hits[0])
            if not chosen:
                hits = [u.n for u in extraction.updates if ref['url'] in u.evidence]
                chosen = hits or None
        if not chosen:
            if len(named) >= 1:
                chosen = named if len(named) == 1 else (sorted(touched) or named)
            elif len(thread.items) == 1:
                chosen = [thread.items[0]['n']]
            elif focus and thread.item(focus):
                chosen = [focus]
        if not chosen:
            return None
        for n in chosen:
            targets.setdefault(n, []).append(ref)
    return targets


def _attach(db, employee, thread: Thread, targets: dict[int, list[dict]], text, channel, chat_message, turn: Turn, request=None):
    for n, refs in targets.items():
        item = thread.item(n)
        if not item:
            continue
        rows = files.capture(db, employee, refs=refs, chat_message=chat_message, work_item_ids=[item['work_item_id']],
                             note=text, channel=channel, check_in=thread.check_in, request=request)
        if rows or refs:
            work = db.get(WorkItem, item['work_item_id'])
            names = ', '.join(r['name'] for r in refs)
            turn.attached.append(f'Attached to **{short_title(_md(work.title))}**: {names}')


async def handle(db, employee, check_in, text: str, *, channel: str, chat_attachments=(), chat_message='') -> dict:
    """One reply to an open check-in. Returns {'reply', 'actions', 'auto_applied', 'mode', 'handoff'}. No commit."""
    from backend.app.services.assistant import provider_configured
    thread = Thread.load(check_in)
    pending = thread.pending
    request = db.get(UpdateRequest, check_in.update_request_id) if check_in.update_request_id else None
    refs = files.chat_files(chat_attachments) + files.links_in(text)
    turn = Turn()
    questions: list[dict] = []
    q = pending['question'] or {}
    focus = q.get('n') if q.get('ambiguity') in ('vague_progress', 'hedged_completion') else None
    mode = 'offline'
    extraction = Extraction(is_reply=True)
    parsed = None
    answered_question = False

    # 1. The answer to a structured question.
    number = NUMBER_ONLY.match(text or '')
    kind = q.get('ambiguity')
    if kind == 'which_item_for_file' and number and thread.item(int(number[1])):
        n = int(number[1])
        _attach(db, employee, thread, {n: pending.get('files', [])}, text, channel, chat_message, turn, request)
        pending['files'] = []
        answered_question = True
        refs = []
    elif kind == 'which_item' and number and thread.item(int(number[1])):
        n = int(number[1])
        stored = dict(q.get('update') or {})
        if stored:
            stored['n'] = n
            extraction = validate(db, employee, thread, Extraction(is_reply=True, updates=[ItemUpdate(**stored)]), q.get('message', ''))
        else:
            focus = n
            extraction = Extraction(is_reply=True, ambiguity='vague_progress', ambiguity_n=n)
        answered_question = True
    elif kind == 'date_without_date' and q.get('n') and (when := parse_date(text, today())):
        reason = _reason(text)
        evidence = text.strip()[:300]
        extraction = validate(db, employee, thread, Extraction(is_reply=True, updates=[
            ItemUpdate(n=q['n'], new_due_date=when, reason=reason, evidence=evidence)]), text)
        if not extraction.updates:
            extraction = Extraction(is_reply=True, ambiguity='date_without_date', ambiguity_n=q['n'])
        answered_question = True
    elif kind == 'slip_without_reason' and q.get('n') and q.get('date') and len(text.strip()) >= 3 and not (YES.match(text) or NO.match(text)):
        extraction = Extraction(is_reply=True, updates=[ItemUpdate(n=q['n'], new_due_date=date.fromisoformat(q['date']),
                                                                   reason=text.strip()[:500], evidence=text.strip()[:300])])
        extraction = validate(db, employee, thread, extraction, text)
        answered_question = True
    elif kind == 'blocker_without_owner' and q.get('n') and len(text.strip()) >= 2:
        person, _ = _person_in(text, _people(db, employee))
        what = text.strip(' .!')[:200]
        extraction = validate(db, employee, thread, Extraction(is_reply=True, updates=[ItemUpdate(
            n=q['n'], status='Blocked', blocker_person=person.name if person else None,
            blocker_what=None if person else what, evidence=text.strip()[:300])]), text)
        answered_question = True

    # 2. Otherwise read the message: the model first when configured, then the deterministic parser.
    if not answered_question:
        if not text.strip() and refs:
            extraction = Extraction(is_reply=True)
        else:
            raw = None
            if provider_configured():
                try:
                    raw = await llm_extract(db, employee, thread, text, _history(db, employee, check_in), focus)
                    mode = 'connected' if raw else mode
                except (httpx.HTTPError, ValueError, KeyError, IndexError, ValidationError):
                    log.warning('Check-in extraction fell back to the deterministic parser (check-in %s).', check_in.id)
                    raw = None
            parsed = deterministic_extract(db, employee, thread, text, focus)
            if raw is None:
                raw = parsed.extraction
            if not raw.is_reply and not refs:
                return {'handoff': True}
            extraction = validate(db, employee, thread, raw, text)
        pending['question'] = None
        pending['queue'] = [x for x in pending['queue'] if x.get('ambiguity') == 'which_item_for_file']
    else:
        pending['question'] = None

    # 3. Decide and apply.
    if extraction.updates:
        apply_updates(db, employee, thread, extraction.updates, channel, turn, questions)
    if extraction.ambiguity != 'none':
        amb = {'ambiguity': extraction.ambiguity, 'n': extraction.ambiguity_n}
        if extraction.ambiguity == 'which_item' and parsed and parsed.pending_update:
            amb |= {'update': parsed.pending_update, 'message': text}
        if extraction.ambiguity in ('vague_progress', 'hedged_completion') and amb['n'] is None:
            open_items = [i for i in thread.items if i['n'] not in pending['answered']]
            amb['n'] = (open_items[0] if open_items else thread.items[0])['n']
        if extraction.ambiguity == 'slip_without_reason' and amb['n'] and not any(x.get('ambiguity') == 'slip_without_reason' for x in questions):
            continue_update = next((u for u in extraction.updates if u.n == amb['n']), None)
            if continue_update and continue_update.new_due_date:
                amb['date'] = str(continue_update.new_due_date)
        if not any(x.get('ambiguity') == amb['ambiguity'] and x.get('n') == amb['n'] for x in questions):
            questions.insert(0, amb)
        if amb['n'] in pending['answered'] and amb['ambiguity'] != 'which_item':
            pending['answered'].remove(amb['n'])

    # 4. Files and links: attach where it is clear, otherwise ask which item.
    if refs:
        targets = _file_targets(thread, parsed, extraction, refs, focus or q.get('n'))
        if targets is None:
            pending['files'] = [{k: v for k, v in r.items() if k != 'start'} for r in refs]
            questions.append({'ambiguity': 'which_item_for_file', 'n': None})
        else:
            _attach(db, employee, thread, targets, text, channel, chat_message, turn, request)

    # 5. A manager's request also gets the answer in the Update center.
    first_turn_reply = ''
    if request:
        first_turn_reply = _answer_request(db, employee, request, text, refs, turn)

    # 6. The reply: what was saved, then one question (a confirmation first).
    for qq in questions:
        if qq.get('ambiguity') == 'slip_without_reason' and not qq.get('date'):
            continue
        pending['queue'].append(qq)
    parts = [first_turn_reply] if first_turn_reply else []
    if turn.saved:
        parts.append('Saved:\n' + '\n'.join('- ' + s for s in turn.saved))
    parts += turn.attached
    waiting = _pending_actions(db, thread)
    if waiting:
        parts.append(confirm_text(db, waiting))
    else:
        parts += _next_question(db, thread)
    if not turn.saved and not turn.attached and not waiting and len(parts) == (1 if first_turn_reply else 0):
        remaining = [i for i in thread.items if i['n'] not in pending['answered']]
        if remaining and not answered_question and check_in.clarify_rounds < 2:
            pending['question'] = {'ambiguity': 'vague_progress', 'n': remaining[0]['n']}
            parts += _next_question(db, thread)
        elif not remaining:
            parts.append('Thanks, that\'s everything for today.')
    thread.save()
    if check_in.status == 'Open' and turn.saved and not waiting:
        left = [str(i['n']) for i in thread.items if i['n'] not in pending['answered']]
        if left:
            parts.append(f'Still open: {", ".join(left)}. Reply when you can.')
    if turn.saved and undo_available(db, employee):
        parts.append('Say `undo` to reverse this.')
    return {'reply': '\n\n'.join(p for p in parts if p), 'actions': waiting, 'auto_applied': bool(turn.saved), 'mode': mode, 'handoff': False}


def _answer_request(db, employee, request, text, refs, turn: Turn) -> str:
    from backend.app.services.coordination import reply_to_request
    sender = db.get(Employee, request.requester_id)
    if request.status == 'Delivered':
        message = text.strip() if len(text.strip()) >= 3 else ('Shared ' + ', '.join(r['name'] for r in refs) if refs else '')
        if len(message) < 3:
            return ''
        try:
            with db.begin_nested():
                reply_to_request(db, employee, request, UpdateReply(message=message[:4000]))
        except HTTPException as exc:
            return f'I couldn\'t send that to {sender.name if sender else "the requester"}: {exc.detail}'
        return f'Thanks. I sent your update to {sender.name if sender else "the requester"}.'
    if request.status == 'Responded' and text.strip() and not (YES.match(text) or NO.match(text) or NUMBER_ONLY.match(text)):
        request.response = ((request.response or '') + '\n' + text.strip())[:8000]
    return ''
