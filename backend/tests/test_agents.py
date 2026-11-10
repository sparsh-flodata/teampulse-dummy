from sqlalchemy import select
from test_workflows import ctx, login
from backend.app.agents.graph import assistant_graph
from backend.app.models import Dependency, Notification


def own_work(c):
    state = c.get('/api/state').json()
    return next(w for w in state['work'] if w['owner_id'] == state['user']['id'] and w['status'] != 'Completed')


def test_graph_has_every_agent_and_the_gates():
    nodes = set(assistant_graph.get_graph().nodes)
    assert {'gather_context', 'route', 'coordination', 'planning', 'progress', 'dependency', 'briefing', 'model', 'guide', 'validate', 'policy'} <= nodes


def test_dependency_agent_drafts_and_confirmation_records_it(ctx):
    c, sessions = ctx
    login(c, 'ananya')
    work = own_work(c)
    draft = c.post('/api/assistant/chat', json={'message': 'Waiting on Rahul Sharma for the API contract', 'work_item_id': work['id']}).json()
    assert draft['agent'] == 'Dependency agent'
    assert draft['steps'][:2] == ['gather_context', 'route'] and draft['steps'][-2:] == ['validate', 'policy']
    payload = draft['action']['payload']
    assert payload['kind'] == 'dependency' and payload['owner_id'] == 2 and payload['deliverable'] == 'API contract'
    with sessions() as db:
        assert not db.scalar(select(Dependency).where(Dependency.work_item_id == work['id'], Dependency.deliverable == 'API contract'))
    assert c.post(f'/api/assistant/actions/{draft["action"]["id"]}/decide', json={'approve': True}).json()['status'] == 'Approved'
    with sessions() as db:
        dep = db.scalar(select(Dependency).where(Dependency.work_item_id == work['id'], Dependency.deliverable == 'API contract'))
        assert dep and dep.owner_id == 2 and dep.partial
        assert db.scalar(select(Notification).where(Notification.key == f'requested:{dep.id}')).recipient_id == 2
    unclear = c.post('/api/assistant/chat', json={'message': 'I am blocked', 'work_item_id': work['id']}).json()
    assert unclear['action'] is None and 'Who is it waiting on' in unclear['reply']


def test_briefing_agent_answers_a_manager_from_records(ctx):
    c, _ = ctx
    login(c, 'rahul')
    answer = c.post('/api/assistant/chat', json={'message': 'Who is behind on my team?'}).json()
    assert answer['agent'] == 'Briefing agent' and answer['action'] is None
    assert 'need action' in answer['reply'] or 'no active commitments' in answer['reply']
    mine = c.post('/api/assistant/chat', json={'message': 'Summarize my week'}).json()
    assert mine['agent'] == 'Briefing agent' and 'commitments' in mine['reply'].lower()
    help_text = c.post('/api/assistant/chat', json={'message': 'hello there'}).json()
    assert help_text['agent'] == 'Assistant guide'
