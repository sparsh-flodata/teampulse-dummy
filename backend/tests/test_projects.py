from sqlalchemy import select
from test_workflows import ctx, login, work_body
from backend.app.models import Notification, ProjectMember, WorkItem


def notices(sessions, person_id, prefix):
    with sessions() as db:
        return [n for n in db.scalars(select(Notification).where(Notification.recipient_id == person_id)) if n.key.startswith(prefix)]


def test_project_overview_has_people_work_stats_and_activity(ctx):
    c, _ = ctx
    login(c, 'ananya')
    page = c.get('/api/projects/1')
    assert page.status_code == 200, page.text
    d = page.json()
    assert d['project']['name'] == 'ERP Implementation' and d['project']['health']['tone'] in ('red', 'amber', 'green', 'neutral')
    assert {w['project_id'] for w in d['work']} == {1}
    assert d['stats']['total'] == len(d['work']) == sum(d['stats']['by_status'].values())
    assert d['stats']['active'] + d['stats']['completed'] == d['stats']['total']
    assert 0 <= d['stats']['progress'] <= 100 and d['stats']['next_due']
    members = {m['id']: m for m in d['members']}
    assert members[3]['involvement'] == 'Department' and members[1]['open_count'] >= 1 and members[1]['active'] is True
    assert d['activity'] and all(a['work_item_id'] in {w['id'] for w in d['work']} for a in d['activity'])
    assert d['permissions'] == {'can_assign': False, 'is_member': True, 'can_take': True, 'can_create': True}
    login(c, 'sara')  # another department, no work there
    assert c.get('/api/projects/1').status_code == 404


def test_managers_assign_anyone_and_reassign_with_notice(ctx):
    c, sessions = ctx
    login(c, 'rahul')
    # Sara is outside Rahul's reporting line and outside the project's department.
    assigned = c.post('/api/work/9/assign', json={'employee_id': 7})
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()['owner_id'] == 7 and not assigned.json()['commitment_confirmed']
    with sessions() as db:
        assert db.get(ProjectMember, (3, 7))
    assert notices(sessions, 7, 'assigned:9:')
    login(c, 'sara')
    page = c.get('/api/projects/3').json()
    assert next(m for m in page['members'] if m['id'] == 7)['involvement'] == 'Invited'
    assert c.patch('/api/work/9', json={'accept_commitment': True}).status_code == 200
    # Handover: both the previous and the new owner hear about it.
    login(c, 'rahul')
    assert c.post('/api/work/9/assign', json={'employee_id': 6}).json()['owner_id'] == 6
    assert notices(sessions, 7, 'handover:9:') and notices(sessions, 6, 'assigned:9:')
    # A manager can also create work for anyone in the organization.
    assert c.post('/api/work', json=work_body(owner=7, project_id=1, title='Cross-team review')).status_code == 201
    # Completed work stays with its owner.
    assert c.post('/api/work/11/assign', json={'employee_id': 3}).status_code == 409


def test_members_take_unassigned_work_for_themselves_only(ctx):
    c, sessions = ctx
    login(c)
    open_item = c.post('/api/work', json=work_body(owner=None, title='Unclaimed task')).json()
    login(c, 'ananya')
    assert c.post(f'/api/work/{open_item["id"]}/assign', json={'employee_id': 4}).status_code == 403  # not for others
    taken = c.post(f'/api/work/{open_item["id"]}/assign', json={'employee_id': 3})
    assert taken.status_code == 200 and taken.json()['owner_id'] == 3 and taken.json()['commitment_confirmed']
    login(c, 'arjun')
    assert c.post(f'/api/work/{open_item["id"]}/assign', json={'employee_id': 4}).status_code == 403  # owned already
    login(c, 'sara')  # not on the project: cannot see it, so cannot take it
    assert c.post(f'/api/work/{open_item["id"]}/assign', json={'employee_id': 7}).status_code == 404
    with sessions() as db:
        assert db.get(WorkItem, open_item['id']).owner_id == 3


def test_dependency_creates_a_linked_commitment_that_fulfils_it_when_completed(ctx):
    from backend.app.models import Dependency
    c, sessions = ctx
    login(c, 'ananya')
    dep_body = {'owner_id': 4, 'deliverable': 'Geo export schema', 'reason': 'Needed for the map filter', 'due_date': work_body()['due_date'],
                'impact': 'High', 'partial': False, 'effort_hours': 5}
    # Created together with a new commitment (employees create their own).
    created = c.post('/api/work', json=work_body(owner=3, title='Build the map filter') | {'dependencies': [dep_body]})
    assert created.status_code == 201, created.text
    work_id = created.json()['id']
    assert created.json()['status'] == 'Blocked'  # the dependency is not partial
    with sessions() as db:
        dep = db.scalar(select(Dependency).where(Dependency.work_item_id == work_id))
        linked = db.get(WorkItem, dep.upstream_work_id)
        assert linked.owner_id == 4 and linked.title == 'Geo export schema' and linked.project_id == 1 and linked.remaining_hours == 5
        dep_id, linked_id = dep.id, linked.id
    assert notices(sessions, 4, f'requested:{dep_id}')
    # The owner sees a commitment awaiting their confirmation and accepts it: the dependency follows.
    login(c, 'arjun')
    mine = next(w for w in c.get('/api/state').json()['work'] if w['id'] == linked_id)
    assert not mine['commitment_confirmed']
    assert c.patch(f'/api/work/{linked_id}', json={'accept_commitment': True, 'status': 'In Progress', 'progress': 30}).status_code == 200
    with sessions() as db:
        assert db.get(Dependency, dep_id).status == 'In Progress'
    # Completing the linked commitment fulfils the dependency and unblocks the waiting work.
    assert c.patch(f'/api/work/{linked_id}', json={'status': 'Completed', 'note': 'Schema is published.'}).status_code == 200
    with sessions() as db:
        assert db.get(Dependency, dep_id).status == 'Verified'
        assert db.get(WorkItem, work_id).status == 'In Progress'
    assert notices(sessions, 3, 'dep-update:')
    # A dependency can still point at existing work instead of creating a new commitment.
    login(c, 'ananya')
    other = c.post('/api/work', json=work_body(owner=3, title='Another commitment')).json()
    linked_existing = c.post('/api/dependencies', json={'work_item_id': other['id'], 'owner_id': 3, 'upstream_work_id': work_id, 'deliverable': 'Existing work',
                                                       'due_date': work_body()['due_date'], 'impact': 'Low', 'partial': True})
    assert linked_existing.status_code == 201 and linked_existing.json()['upstream_work_id'] == work_id


def test_managers_ask_anyone_but_employees_stay_on_the_project(ctx):
    c, sessions = ctx
    login(c, 'ananya')
    refused = c.post('/api/work', json=work_body(owner=3, title='Needs Sara') | {'dependencies': [{'owner_id': 7, 'deliverable': 'Ops handover', 'due_date': work_body()['due_date']}]})
    assert refused.status_code == 422
    with sessions() as db:
        assert not db.scalar(select(WorkItem).where(WorkItem.title == 'Needs Sara'))  # nothing was half-created
    login(c, 'rahul')
    ok = c.post('/api/work', json=work_body(owner=3, title='Needs Sara') | {'dependencies': [{'owner_id': 7, 'deliverable': 'Ops handover', 'due_date': work_body()['due_date']}]})
    assert ok.status_code == 201, ok.text
    with sessions() as db:
        assert db.get(ProjectMember, (1, 7))
