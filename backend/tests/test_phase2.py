"""Phase 2 permission boundaries, hierarchy, health, migrations, and ingestion."""
import json
from datetime import timedelta
from sqlalchemy import create_engine, select, text, func
from fastapi.testclient import TestClient
from test_workflows import ctx, login, work_body, HEADERS
from backend.app.main import app
from backend.app.models import Employee, WorkItem, Commitment, AgentAction, Conversation, MessageReceipt, now
from backend.app.services.work import today, business_day, serialize_work
from backend.app.db.migrations import migrate


def test_reporting_manager_profiles_do_not_expose_peer_capacity(ctx):
    c,_=ctx
    login(c,'rahul')
    state=c.get('/api/state').json()
    assert set(state['profile_ids'])=={2,5,6}
    assert set(state['report_ids'])=={5,6}
    assert {p['id'] for p in state['employees']}=={2,5,6}
    assert len(state['directory'])==7
    outsider=next(p for p in state['directory'] if p['id']==7)
    assert not outsider['can_view_profile']
    assert not {'email','capacity','skills','weekly_hours','password_hash'} & set(outsider)
    assert c.get('/api/people/5/profile').status_code==200
    assert c.get('/api/people/3/profile').status_code==403
    assert c.get('/api/people/7/profile').status_code==403
    assert c.patch('/api/work/3',json={'progress':80}).status_code==403
    # Managers may assign anyone in the organization (the assignee confirms); editing others' work stays scoped.
    assert c.post('/api/work',json=work_body(owner=3)).status_code==201
    assert c.post('/api/work/9/assign',json={'employee_id':3}).status_code in (200,404)


def test_every_role_keeps_own_work_and_directory(ctx):
    c,_=ctx
    for name in ('nitish','rahul','ananya'):
        login(c,name)
        state=c.get('/api/state').json()
        response=c.get('/api/people/'+str(state['user']['id'])+'/profile')
        assert response.status_code==200
        assert all(w['owner_id']==state['user']['id'] for w in response.json()['work'])
        assert len(state['directory'])==7
    assert c.get('/api/people/1/profile').status_code==403
    login(c)
    assert c.get('/api/people/7/profile').status_code==200


def test_cross_team_report_does_not_grant_whole_project_access(ctx):
    c,_=ctx
    login(c)
    assert c.patch('/api/employees/5',json={'team_id':2}).status_code==200
    work=c.post('/api/work',json=work_body(owner=5,project_id=4,title='Operations report deliverable')).json()
    login(c,'rahul')
    state=c.get('/api/state').json()
    assert work['id'] in {w['id'] for w in state['work']}
    assert 4 in {p['id'] for p in state['projects']}
    assert c.get('/api/work/'+str(work['id'])+'/history').status_code==200
    assert c.get('/api/work/10/history').status_code==404
    assert c.patch('/api/work/10',json={'progress':90}).status_code==404
    assert c.get('/api/people/7/profile').status_code==403


def test_hierarchy_changes_take_effect_for_existing_sessions(ctx):
    c,_=ctx
    login(c)
    assert c.patch('/api/employees/5',json={'manager_id':1}).status_code==200
    login(c,'rahul')
    assert c.get('/api/people/5/profile').status_code==403
    assert 5 not in c.get('/api/state').json()['profile_ids']
    assert c.patch('/api/work/5',json={'progress':40}).status_code==403
    assert c.patch('/api/employees/5',json={'manager_id':2}).status_code==403


def test_circular_reporting_and_demotions_are_rejected(ctx):
    c,_=ctx
    login(c)
    assert c.patch('/api/employees/1',json={'manager_id':2}).status_code==409
    assert c.patch('/api/employees/2',json={'manager_id':2}).status_code==409
    assert c.patch('/api/employees/2',json={'role':'employee'}).status_code==409
    assert c.patch('/api/employees/2',json={'active':False}).status_code==409
    assert c.patch('/api/employees/1',json={'active':False}).status_code==409
    assert c.patch('/api/employees/3',json={'manager_id':9999}).status_code==422
    assert c.patch('/api/employees/3',json={'manager_id':4}).status_code==422
    assert c.patch('/api/employees/3',json={'name':None}).status_code==422


def test_nested_team_creation_and_cycle_checks(ctx):
    c,_=ctx
    login(c)
    new=c.post('/api/teams',json={'name':'Platform','parent_id':1,'lead_id':2})
    assert new.status_code==201,new.text
    child=new.json()['id']
    assert c.patch('/api/teams/1',json={'parent_id':child}).status_code==409
    assert c.patch('/api/teams/'+str(child),json={'name':'Platform systems','parent_id':None}).status_code==200
    assert c.post('/api/teams',json={'name':'Platform systems'}).status_code==409
    assert c.post('/api/teams',json={'name':'Invalid','lead_id':4}).status_code==422
    login(c,'rahul')
    assert c.post('/api/teams',json={'name':'Forbidden'}).status_code==403
    assert c.post('/api/employees',json={'name':'Unauthorized manager','email':'new@company.com','password':'long-password-2026','team_id':1,'role':'manager'}).status_code==403


def test_deactivation_invalidates_an_existing_session(ctx):
    c,_=ctx
    other=TestClient(app,headers=HEADERS)
    login(other,'ananya')
    login(c)
    assert c.patch('/api/employees/3',json={'active':False}).status_code==200
    assert other.get('/api/state').status_code==401
    assert other.post('/api/auth/login',json={'email':'ananya@teampulse.local','password':'test-password-2026!'}).status_code==401


def test_health_never_calls_a_blocker_on_track(ctx):
    c,sessions=ctx
    with sessions() as db:
        assert serialize_work(db,db.get(WorkItem,5))['tone']=='red'
        partial=serialize_work(db,db.get(WorkItem,3))
        assert partial['tone']=='amber' and partial['health']!='On track'
        normal=serialize_work(db,db.get(WorkItem,6))
        assert normal['tone']=='green' and normal['next_action'].startswith('No intervention')
        stale=db.get(WorkItem,6)
        stale.confirmed_at=now()-timedelta(days=2)
        assert serialize_work(db,stale)['tone']=='neutral'
        completed=serialize_work(db,db.get(WorkItem,11))
        assert completed['tone']=='green'
    login(c)
    profile=c.get('/api/people/5/profile').json()
    assert profile['health']['tone']=='red'
    assert all('health_reason' in w and 'next_action' in w for w in profile['work'])


def test_stale_agent_proposal_cannot_overwrite_new_progress(ctx):
    c,_=ctx
    login(c)
    action=c.post('/api/assistant/chat',json={'message':'50% complete, 10 hours remaining','work_item_id':1}).json()['action']
    c.patch('/api/work/1',json={'progress':75,'note':'A newer employee update'})
    result=c.post('/api/assistant/actions/'+str(action['id'])+'/decide',json={'approve':True})
    assert result.status_code==409
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==1)['progress']==75
    history=c.get('/api/assistant/history').json()
    assert next(a for a in history['actions'] if a['id']==action['id'])['status']=='Proposed'


def test_channel_message_receipts_are_idempotent_and_bound_to_content(ctx):
    c,sessions=ctx
    login(c)
    body={'message':'70% complete, 6 hours remaining','work_item_id':1,'request_id':'stable-message-0001'}
    first=c.post('/api/assistant/chat',json=body).json()
    second=c.post('/api/assistant/chat',json=body).json()
    assert second['duplicate'] and first['action']['id']==second['action']['id']
    assert c.post('/api/assistant/chat',json=body|{'message':'A different message'}).status_code==409
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(MessageReceipt))==1
        assert db.scalar(select(func.count()).select_from(Conversation))==2
        assert db.scalar(select(func.count()).select_from(AgentAction))==1


def test_opt_in_automatic_routine_updates_exclude_completion_and_dates(ctx):
    c,_=ctx
    login(c)
    settings={'weekly_hours':40,'reserved_hours':8,'capacity_confirmed':True,'planning':'Hybrid','agent_auto_updates':True}
    assert c.patch('/api/me/availability',json=settings).status_code==200
    result=c.post('/api/assistant/chat',json={'message':'75% complete, 5 hours remaining','work_item_id':1,'request_id':'auto-message-0001'}).json()
    assert result['auto_applied'] and result['action']['status']=='Applied'
    work=next(w for w in c.get('/api/state').json()['work'] if w['id']==1)
    assert work['progress']==75 and work['remaining_hours']==5
    complete=c.post('/api/assistant/chat',json={'message':'Finished','work_item_id':1}).json()
    assert not complete['auto_applied'] and complete['action']['status']=='Proposed'
    revised=c.post('/api/assistant/chat',json={'message':'Move to '+str(business_day(today(),4))+' because requirements changed','work_item_id':1}).json()
    assert not revised['auto_applied'] and revised['action']['status']=='Proposed'


def test_additive_migration_preserves_existing_records(tmp_path):
    engine=create_engine('sqlite:///'+str(tmp_path/'legacy.db'))
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE teams (id INTEGER PRIMARY KEY, name VARCHAR(120) UNIQUE NOT NULL)'))
        conn.execute(text("INSERT INTO teams(id,name) VALUES(1,'Preserved team')"))
        conn.execute(text('CREATE TABLE employees (id INTEGER PRIMARY KEY, name VARCHAR(120), email VARCHAR(254), role VARCHAR(20), manager_id INTEGER)'))
        conn.execute(text("INSERT INTO employees(id,name,email,role) VALUES(1,'Existing person','person@example.com','admin')"))
        conn.execute(text('CREATE TABLE agent_actions (id INTEGER PRIMARY KEY, employee_id INTEGER, payload TEXT, status VARCHAR(20))'))
        conn.execute(text("INSERT INTO agent_actions VALUES(1,1,'{}','Proposed')"))
    migrate(engine)
    migrate(engine)
    with engine.connect() as conn:
        assert conn.execute(text('SELECT name,active,agent_auto_updates FROM employees')).one()==('Existing person',1,0)
        assert conn.execute(text('SELECT name,parent_id,lead_id FROM teams')).one()==('Preserved team',None,None)
        assert conn.execute(text('SELECT base_snapshot FROM agent_actions')).scalar()=='{}'
        assert conn.execute(text('SELECT COUNT(*) FROM schema_migrations')).scalar()==5
    engine.dispose()
