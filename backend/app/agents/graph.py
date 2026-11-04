"""The TeamPulse assistant as a LangGraph state graph.

    gather_context -> route -> one agent -> validate -> policy -> END

Agents (plan section 8.1, first release: capabilities of one graph):
    coordination  ask teammates for updates            (proposal: request_updates)
    planning      draft a new commitment                (proposal: create)
    progress      update the user's own selected work   (proposal: update)
    dependency    record what the selected work waits on (proposal: dependency)
    briefing      answer "what's on my plate" / "who is behind" from records
    model         a configured LLM provider, for free-form messages
    guide         explain what the assistant can do

The AI interprets and recommends; it never writes. `validate` re-checks every
proposal against permissions, `policy` decides what may apply without a person
confirming (only explicit, routine progress numbers under the user's opt-in).
Writes go through the normal services when the person confirms.

db and user travel in the run config, not in the state, so state stays plain data.
"""
import re
from datetime import date
from typing import Any, TypedDict
import httpx
from fastapi import HTTPException
from langgraph.graph import END, START, StateGraph
from pydantic import ValidationError
from sqlalchemy import select
from backend.app.core.access import profile_ids
from backend.app.models import Conversation, Employee, Project, WorkItem
from backend.app.services.coordination import allowed_recipients, coordination_intent, validate_recipients
from backend.app.services.work import (
    business_day, get_work, participates_in_project, serialize_work, today, visible_projects, visible_work,
)

AGENTS = {
    'coordination': 'Coordination agent', 'planning': 'Planning agent', 'progress': 'Progress agent',
    'dependency': 'Dependency agent', 'briefing': 'Briefing agent', 'model': 'Language model', 'guide': 'Assistant guide',
}
BLOCKER = re.compile(r'\b(blocked|block(?:ing|er)?|waiting (?:on|for)|depends? on|need[s]? .+ from)\b', re.I)
TEAM_QUESTION = re.compile(r'\b(who|team|reports?|everyone|behind|at risk|overdue|blocked)\b', re.I)
PERSONAL_SUMMARY = re.compile(r'(summar|priorit|week|today|commitment|my plate|my work|what should i)', re.I)


class AssistantState(TypedDict, total=False):
    message: str
    work_id: int | None
    recipient_ids: list[int]
    context: dict[str, Any]          # facts the agents and the model may use
    route: str
    interpretation: dict[str, Any]   # {'reply': str, 'proposal': dict | None}
    mode: str                        # 'offline' or 'connected'
    auto_apply: bool                 # set by policy
    steps: list[str]


def _ctx(config):
    c = config['configurable']
    return c['db'], c['user']


def _step(state, name):
    return state.get('steps', []) + [name]


# ---- Nodes ------------------------------------------------------------------------

def gather_context(state: AssistantState, config) -> AssistantState:
    db, user = _ctx(config)
    works = [w for w in visible_work(db, user) if w.owner_id == user.id]
    selected = next((w for w in works if w.id == state.get('work_id')), None)
    if state.get('work_id') and selected is None:
        raise HTTPException(403, 'Select one of your own work items.')
    projects = visible_projects(db, user)
    rows = list(db.scalars(select(Conversation).where(Conversation.employee_id == user.id).order_by(Conversation.id.desc()).limit(12)))[::-1]
    return {'context': {
        'today': str(today()), 'selected_work_item_id': state.get('work_id'),
        'work': [serialize_work(db, w) for w in works],
        'projects': [{'id': p.id, 'name': p.name} for p in projects],
        'requestable_people': [{'id': p.id, 'name': p.name, 'title': p.title} for p in allowed_recipients(db, user)],
        'history': [{'role': r.role, 'content': r.message} for r in rows],
        'is_manager': user.role in ('manager', 'admin'),
    }, 'mode': 'offline', 'steps': _step(state, 'gather_context')}


def route(state: AssistantState, config) -> AssistantState:
    from backend.app.services.assistant import provider_configured
    db, user = _ctx(config)
    text, ctx = state['message'], state['context']
    selected = ctx['selected_work_item_id']
    if coordination_intent(db, user, text, state.get('recipient_ids')):
        choice = 'coordination'
    elif text.lower().startswith('plan:'):
        choice = 'planning'
    elif selected and BLOCKER.search(text):
        choice = 'dependency'
    elif ctx['is_manager'] and TEAM_QUESTION.search(text) and not selected:
        choice = 'briefing'
    elif provider_configured():
        choice = 'model'
    elif selected:
        choice = 'progress'
    elif PERSONAL_SUMMARY.search(text):
        choice = 'briefing'
    else:
        choice = 'guide'
    return {'route': choice, 'steps': _step(state, 'route')}


def coordination_agent(state: AssistantState, config) -> AssistantState:
    db, user = _ctx(config)
    return {'interpretation': coordination_intent(db, user, state['message'], state.get('recipient_ids')),
            'steps': _step(state, 'coordination')}


def _offline(state, config):
    from backend.app.services.assistant import offline_interpret
    db, user = _ctx(config)
    works = [w for w in visible_work(db, user) if w.owner_id == user.id]
    selected = next((w for w in works if w.id == state['context']['selected_work_item_id']), None)
    return offline_interpret(state['message'], works, visible_projects(db, user), selected).model_dump(mode='json')


def planning_agent(state: AssistantState, config) -> AssistantState:
    return {'interpretation': _offline(state, config), 'steps': _step(state, 'planning')}


def progress_agent(state: AssistantState, config) -> AssistantState:
    return {'interpretation': _offline(state, config), 'steps': _step(state, 'progress')}


def guide_agent(state: AssistantState, config) -> AssistantState:
    return {'interpretation': _offline(state, config), 'steps': _step(state, 'guide')}


def dependency_agent(state: AssistantState, config) -> AssistantState:
    """'Blocked on Raj for the schema review' -> a dependency proposal on Raj."""
    db, user = _ctx(config)
    text = state['message']
    work = db.get(WorkItem, state['context']['selected_work_item_id'])
    project = db.get(Project, work.project_id)
    people = [p for p in db.scalars(select(Employee).where(Employee.active.is_(True), Employee.id != user.id))
              if participates_in_project(db, p, project)]
    lowered = text.casefold()
    named = [p for p in people if re.search(r'(?<!\w)' + re.escape(p.name.casefold()) + r'(?!\w)', lowered)] \
        or [p for p in people if re.search(r'(?<!\w)' + re.escape(p.name.split()[0].casefold()) + r'(?!\w)', lowered)]
    step = _step(state, 'dependency')
    if len(named) != 1:
        ask = 'Who is it waiting on? Mention their full name' if not named else 'That matches several teammates. Use their full name'
        return {'interpretation': {'reply': f'{ask}, for example “waiting on Raj Paswan for the schema review by {business_day(today(), 2)}”. Nothing has changed yet.', 'proposal': None}, 'steps': step}
    owner = named[0]
    # The deliverable is what follows the person's name: "waiting on Raj for the schema review by 2026-11-06".
    mention = re.search(re.escape(owner.name) + '|' + re.escape(owner.name.split()[0]), text, re.I)
    tail = text[mention.end():] if mention else text
    tail = re.sub(r'\s+by\s+\d{4}-\d{2}-\d{2}.*$', '', tail, flags=re.I)
    tail = re.sub(r'^\W*(?:for|to send|to deliver|to share|on)?\s*(?:the|a|an)?\s+', '', tail, flags=re.I)
    deliverable = tail.strip(' .!').strip()[:200]
    if len(deliverable) < 3:
        deliverable = f'Input needed for {work.title}'[:200]
    due = re.search(r'\b(\d{4}-\d{2}-\d{2})\b', text)
    try:
        due_date = date.fromisoformat(due[1]) if due else business_day(today(), 2)
    except ValueError:
        due_date = business_day(today(), 2)
    proposal = {'kind': 'dependency', 'work_item_id': work.id, 'owner_id': owner.id, 'deliverable': deliverable,
                'due_date': str(due_date), 'partial': not re.search(r'\b(fully|completely|can.?t continue|cannot continue)\b', text, re.I),
                'note': text}
    reply = (f'I drafted a dependency: {work.title} is waiting on {owner.name} for “{deliverable}” by {due_date}. '
             f'Confirm and {owner.name.split()[0]} is notified; your work shows as {"partially" if proposal["partial"] else "fully"} blocked until it is delivered.')
    return {'interpretation': {'reply': reply, 'proposal': proposal}, 'steps': step}


def briefing_agent(state: AssistantState, config) -> AssistantState:
    """Answers from records only: the person's own week, or a manager's reporting team."""
    db, user = _ctx(config)
    step = _step(state, 'briefing')
    if state['context']['is_manager'] and TEAM_QUESTION.search(state['message']):
        team = profile_ids(db, user) - {user.id}
        works = [serialize_work(db, w) for w in visible_work(db, user) if w.owner_id in team and w.status != 'Completed']
        names = {p.id: p.name for p in db.scalars(select(Employee).where(Employee.id.in_(team)))} if team else {}
        red = [w for w in works if w['tone'] == 'red']
        amber = [w for w in works if w['tone'] == 'amber']
        if not works:
            reply = 'Your reporting team has no active commitments recorded.'
        else:
            lines = [f'• {names.get(w["owner_id"], "Someone")}: {w["title"]}, {w["health"].lower()}. {w["next_action"]}' for w in (red + amber)[:6]]
            head = f'{len(red)} need action and {len(amber)} need a look across {len(works)} active commitments.'
            reply = head + ('\n' + '\n'.join(lines) if lines else '\nEverything else is on track.')
        return {'interpretation': {'reply': reply, 'proposal': None}, 'steps': step}
    return {'interpretation': _offline(state, config), 'steps': step}


async def model_agent(state: AssistantState, config) -> AssistantState:
    from backend.app.services.assistant import provider_interpret
    ctx = {k: v for k, v in state['context'].items() if k not in ('history', 'is_manager')}
    step = _step(state, 'model')
    try:
        result = await provider_interpret(state['message'], ctx, state['context']['history'])
        if result:
            return {'interpretation': result.model_dump(mode='json'), 'mode': 'connected', 'steps': step}
    except (httpx.HTTPError, ValueError, KeyError, IndexError, ValidationError):
        fallback = _offline(state, config)
        fallback['reply'] = 'The AI provider is unavailable. Using offline planning.\n\n' + fallback['reply']
        return {'interpretation': fallback, 'steps': step + ['offline_fallback']}
    return {'interpretation': _offline(state, config), 'steps': step + ['offline_fallback']}


def validate(state: AssistantState, config) -> AssistantState:
    """Every proposal is re-checked against permissions before anyone sees a confirm button."""
    from backend.app.services.assistant import Interpretation
    db, user = _ctx(config)
    result = Interpretation.model_validate(state['interpretation'])
    p = result.proposal
    if p:
        works = [w for w in visible_work(db, user) if w.owner_id == user.id]
        if p.kind == 'request_updates':
            validate_recipients(db, user, p.recipient_ids)
        elif p.kind in ('update', 'dependency'):
            target = get_work(db, user, p.work_item_id or 0, edit=True)
            if target.owner_id != user.id:
                raise HTTPException(403, 'The assistant can only propose changes to your own work.')
        elif not all((p.title, p.project_id, p.due_date, p.effort_hours)) or p.project_id not in [x.id for x in visible_projects(db, user)]:
            result = Interpretation(reply='I need a project, deliverable, estimated hours, and expected completion date to draft a commitment.')
        elif any(w.title.casefold() == p.title.casefold() for w in works):
            result = Interpretation(reply='A commitment with that title already exists. Select it to update existing work.')
    return {'interpretation': result.model_dump(mode='json'), 'steps': _step(state, 'validate')}


def policy(state: AssistantState, config) -> AssistantState:
    """What may apply without the person confirming.

    Only an explicit progress percentage or remaining-hours update to the user's
    own selected work, when they opted in, and only when the deterministic parser
    reads the message the same way. Completion, new work, date changes,
    dependencies and requests to other people always wait for confirmation.
    """
    db, user = _ctx(config)
    proposal = (state['interpretation'] or {}).get('proposal')
    allowed = False
    if proposal and proposal.get('kind') == 'update' and user.agent_auto_updates and state['context']['selected_work_item_id']:
        routine = proposal.get('status') is None and proposal.get('due_date') is None and (
            proposal.get('progress') is not None or proposal.get('remaining_hours') is not None)
        allowed = routine and (_offline(state, config).get('proposal') == proposal)
    return {'auto_apply': allowed, 'steps': _step(state, 'policy')}


def build_graph():
    g = StateGraph(AssistantState)
    g.add_node('gather_context', gather_context)
    g.add_node('route', route)
    for name, fn in (('coordination', coordination_agent), ('planning', planning_agent), ('progress', progress_agent),
                     ('dependency', dependency_agent), ('briefing', briefing_agent), ('model', model_agent), ('guide', guide_agent)):
        g.add_node(name, fn)
        g.add_edge(name, 'validate')
    g.add_node('validate', validate)
    g.add_node('policy', policy)
    g.add_edge(START, 'gather_context')
    g.add_edge('gather_context', 'route')
    g.add_conditional_edges('route', lambda s: s['route'], {k: k for k in AGENTS})
    g.add_edge('validate', 'policy')
    g.add_edge('policy', END)
    return g.compile()


assistant_graph = build_graph()
