"""Every write the frontend can make, sent with the exact payload shape its forms produce
(frontend/src/features/*/schemas.ts and api.ts, after zod transforms), against the real API.
The backend models reject unknown fields, so a renamed field on either side fails here."""
from datetime import date
from test_workflows import ctx, login
from backend.app.services.work import today, business_day
import backend.app.core.security as security

DUE = lambda n=3: str(business_day(today(), n))


def test_work_dependency_and_assignment_payloads(ctx):
    c, _ = ctx
    login(c)  # admin
    # CreateWorkForm: optionalId -> null, numberField -> number, selects -> strings
    new = c.post('/api/work', json={'title': 'Frontend contract work', 'description': '', 'project_id': 1, 'owner_id': None, 'priority': 'Medium',
                                    'due_date': DUE(), 'effort_hours': 6, 'required_skills': ''})
    assert new.status_code == 201, new.text
    work = new.json()
    assert c.post(f'/api/work/{work["id"]}/assign', json={'employee_id': 2}).status_code == 200
    # WorkDetail update form, as the owner (no due_date/priority) and as a manager (priority)
    login(c, 'rahul')
    owner_update = {'status': 'In Progress', 'progress': 40, 'remaining_hours': 3.5, 'note': 'Halfway', 'accept_commitment': True}
    assert c.patch(f'/api/work/{work["id"]}', json=owner_update | {'due_date': DUE(5)}).status_code == 200
    assert c.patch(f'/api/work/{work["id"]}', json=owner_update | {'priority': 'High'}).status_code == 200
    assert c.get(f'/api/work/{work["id"]}/history').json()[0].keys() >= {'revision', 'due_date', 'reason'}
    # CreateDependencyForm: partial 'partial'|'full' -> boolean, upstream optionalId -> null
    dep = c.post('/api/dependencies', json={'work_item_id': work['id'], 'owner_id': 3, 'upstream_work_id': None, 'deliverable': 'API schema',
                                            'reason': '', 'due_date': DUE(2), 'impact': 'High', 'partial': True})
    assert dep.status_code == 201, dep.text
    login(c, 'ananya')
    for status in ('Accepted', 'In Progress', 'Delivered'):
        assert c.patch(f'/api/dependencies/{dep.json()["id"]}', json={'status': status}).status_code == 200, status
    login(c, 'rahul')
    assert c.patch(f'/api/dependencies/{dep.json()["id"]}', json={'status': 'Verified'}).status_code == 200


def test_organization_and_project_payloads(ctx, monkeypatch):
    c, _ = ctx
    monkeypatch.setattr(security, 'ALLOWED_EMAIL_DOMAINS', ('example.com',))
    login(c)  # admin
    # CreateProjectForm
    project = c.post('/api/projects', json={'name': 'Contract project', 'description': '', 'team_id': 1, 'color': '#278d88'})
    assert project.status_code == 201, project.text
    # TeamDialog create and edit: parent_id/lead_id optionalId
    team = c.post('/api/teams', json={'name': 'Contract team', 'parent_id': None, 'lead_id': None})
    assert team.status_code == 201, team.text
    assert c.patch(f'/api/teams/{team.json()["id"]}', json={'name': 'Contract team 2', 'parent_id': 1, 'lead_id': 2}).status_code == 200
    # AddTeammateForm
    person = c.post('/api/employees', json={'name': 'Contract Person', 'email': 'contract.person@example.com', 'password': 'long-password-2026',
                                            'title': 'Analyst', 'team_id': 1, 'skills': '', 'role': 'employee', 'manager_id': None})
    assert person.status_code == 201, person.text
    # ReportingForm
    edit = c.patch(f'/api/employees/{person.json()["id"]}', json={'name': 'Contract Person', 'title': 'Senior analyst', 'team_id': 1, 'manager_id': 2, 'role': 'employee', 'active': True})
    assert edit.status_code == 200, edit.text


def test_settings_notification_and_chat_payloads(ctx):
    c, _ = ctx
    login(c, 'ananya')
    # SettingsPage
    availability = {'planning': 'Hybrid', 'weekly_hours': 36, 'reserved_hours': 6, 'capacity_confirmed': True, 'agent_auto_updates': False}
    assert c.patch('/api/me/availability', json=availability).status_code == 200
    # NotificationsPopover
    state = c.get('/api/state').json()
    if state['notifications']:
        assert c.post(f'/api/notifications/{state["notifications"][0]["id"]}/read').status_code == 200
    # ChatWorkspace: send, decide, request, reply, cancel
    chat = c.post('/api/assistant/chat', json={'message': 'Summarize my commitments', 'work_item_id': None, 'recipient_ids': [], 'request_id': 'contract-0001'})
    assert chat.status_code == 200 and {'reply', 'action', 'agent'} <= chat.json().keys()
    own = next(w for w in state['work'] if w['owner_id'] == state['user']['id'])
    draft = c.post('/api/assistant/chat', json={'message': '55% complete, 3 hours remaining', 'work_item_id': own['id'], 'recipient_ids': [], 'request_id': 'contract-0002'}).json()
    assert draft['action']['payload']['kind'] == 'update'
    decided = c.post(f'/api/assistant/actions/{draft["action"]["id"]}/decide', json={'approve': True})
    assert decided.status_code == 200 and decided.json()['status'] == 'Approved'
    login(c)  # Ananya reports to the admin in the seed
    ask = c.post('/api/assistant/chat', json={'message': 'Ask Ananya Rao for an update', 'work_item_id': None, 'recipient_ids': [], 'request_id': 'contract-0003'}).json()
    assert ask.get('action'), ask
    result = c.post(f'/api/assistant/actions/{ask["action"]["id"]}/decide', json={'approve': True}).json()
    request = result['requests'][0]
    assert request.keys() >= {'id', 'status', 'can_reply', 'requester_name', 'channel', 'delivery_detail'}
    login(c, 'ananya')
    # UpdateReplyDialog: untouched optional fields are sent as null
    reply = c.post(f'/api/update-requests/{request["id"]}/reply', json={'message': 'Going well, 55% done.', 'work_item_id': None, 'progress': None, 'remaining_hours': None, 'status': None})
    assert reply.status_code == 200, reply.text
    login(c)
    again = c.post('/api/update-requests', json={'recipient_ids': [3], 'prompt': 'One more check-in please', 'channel': 'in_app'}).json()[0]
    assert c.post(f'/api/update-requests/{again["id"]}/cancel').status_code == 200


def test_checkin_preference_and_admin_preview_payloads(ctx):
    c, _ = ctx
    login(c, 'ananya')
    # CheckInsPanel: each control sends one field
    keys = {'proactive_checkins', 'checkins_paused_until', 'checkin_hour', 'org_timezone', 'enabled'}
    assert c.get('/api/me/preferences').json().keys() >= keys
    off = c.patch('/api/me/preferences', json={'proactive_checkins': False})
    assert off.status_code == 200 and off.json()['proactive_checkins'] is False, off.text
    assert c.patch('/api/me/preferences', json={'proactive_checkins': True}).json()['proactive_checkins'] is True
    paused = c.patch('/api/me/preferences', json={'pause_until_tomorrow': True}).json()
    assert paused['checkins_paused_until'] == str(date.fromisoformat(paused['checkins_paused_until']))
    assert c.patch('/api/me/preferences', json={'pause_until_tomorrow': False}).json()['checkins_paused_until'] is None
    state = c.get('/api/state').json()
    assert {'proactive_checkins', 'checkins_paused_until'} <= state['user'].keys()
    # AdminCheckInsPanel: admins only, ?date=YYYY-MM-DD
    assert c.get('/api/admin/check-ins').status_code == 403
    login(c)  # admin
    preview = c.get('/api/admin/check-ins', params={'date': str(today())})
    assert preview.status_code == 200 and preview.json().keys() >= {'date', 'enabled', 'dry_run', 'check_ins'}, preview.text
