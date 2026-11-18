import os
os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['SEED_DEMO'] = 'true'
os.environ['DEMO_PASSWORD'] = 'test-password-2026!'
os.environ['AI_BASE_URL'] = ''
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.db.session import Base, get_db
from backend.app.main import app
from conftest import sso_token
from backend.app.models import WorkItem, Commitment, Employee, Notification, now
from backend.app.seed.pilot import seed
from backend.app.services.work import today, business_day, capacity, run_workflows

HEADERS = {'X-TeamPulse-Request': '1'}

@pytest.fixture
def ctx():
    engine = create_engine('sqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as db:
        seed(db)
    def override():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = override
    client = TestClient(app, headers=HEADERS)
    yield client, sessions
    app.dependency_overrides.clear()
    engine.dispose()

def login(client, name='nitish'):
    """Signs in through (faked) FloData with the role the person already has. `name` is a demo first name or an email."""
    client.headers['Authorization']='Bearer '+sso_token(name if '@' in name else name+'@teampulse.local')

def work_body(owner=1, **kwargs):
    return {'title':'Ship a new report','project_id':1,'owner_id':owner,'due_date':str(business_day(today(),3)),'effort_hours':12, **kwargs}

def test_sso_auth_and_csrf(ctx):
    c,_=ctx
    # No session: APIs answer 401, page loads are sent to the FloData sign-in.
    assert c.get('/api/state').status_code==401
    page=c.get('/api/state?view=board',headers={'Accept':'text/html'},follow_redirects=False)
    assert page.status_code==303 and page.headers['location']=='/auth/login?next=%2Fapi%2Fstate%3Fview%3Dboard'
    assert c.get('/api/state',headers={'Authorization':'Bearer not-a-token'}).status_code==401
    login(c)
    me=c.get('/api/auth/me').json()
    assert me['email']=='nitish@teampulse.local' and me['role']=='admin' and me['roles']==['teampulse:admin']
    assert me['account_url']=='https://sso.test/account' and me['logout_url']=='/auth/logout' and 'password_hash' not in me
    assert c.post('/api/work',json=work_body(),headers={'X-TeamPulse-Request':'0'}).status_code==403
    assert c.post('/api/work',json=work_body(),headers={'Origin':'https://attacker.example'}).status_code==403
    # The browser path: the access token in the httpOnly cookie works the same way.
    c.headers.pop('Authorization')
    c.cookies.set('flodata_teampulse_at',sso_token('nitish@teampulse.local'))
    assert c.get('/api/state').status_code==200
    # A write carrying our cookies from another origin is refused before it reaches the app.
    assert c.post('/api/work',json=work_body(),headers={'Origin':'https://sibling.example'}).status_code==403
    c.cookies.clear()
    assert c.get('/api/state').status_code==401

def test_flodata_roles_gate_access_and_set_the_role(ctx):
    c,sessions=ctx
    def as_(roles, email='nitish@teampulse.local'):
        c.headers['Authorization']='Bearer '+sso_token(email,roles)
    for roles in ('','teampulse:owner'):  # signed in, but no role in this tool
        as_(roles)
        refused=c.get('/api/state')
        assert refused.status_code==403 and refused.json()['detail']=="You don't have access to this tool"
    # Strict by tier, overwritten on every request; the most powerful role wins.
    as_('teampulse:viewer')
    assert c.get('/api/auth/me').json()['role']=='employee'
    assert c.post('/api/teams',json={'name':'Needs admin'}).status_code==403
    as_('teampulse:viewer,teampulse:editor')
    assert c.get('/api/auth/me').json()['role']=='manager'
    as_('teampulse:admin')
    assert c.get('/api/auth/me').json()['role']=='admin'
    assert c.post('/api/teams',json={'name':'Allowed now'}).status_code==201
    # The role is managed in FloData Auth, so TeamPulse no longer edits it.
    assert c.patch('/api/employees/3',json={'role':'manager'}).status_code==422

def test_first_sign_in_links_by_email_or_creates_the_person(ctx, monkeypatch):
    c,sessions=ctx
    # An existing person is matched by email (any case) and linked to the FloData id; later the id wins.
    c.headers['Authorization']='Bearer '+sso_token('Rahul@TeamPulse.local',sub='fd-rahul')
    rahul=c.get('/api/auth/me').json()
    assert rahul['email']=='rahul@teampulse.local'
    c.headers['Authorization']='Bearer '+sso_token('rahul.sharma@teampulse.local','teampulse:editor',sub='fd-rahul',name='Rahul S.')
    renamed=c.get('/api/auth/me').json()
    assert renamed['id']==rahul['id'] and renamed['email']=='rahul.sharma@teampulse.local' and renamed['name']=='Rahul S.'
    with sessions() as db:
        assert db.get(Employee,rahul['id']).flodata_sub=='fd-rahul'
    # Someone FloData lets in without a TeamPulse profile gets one on their first request.
    c.headers['Authorization']='Bearer '+sso_token('asha.rao@flodataanalytics.com','teampulse:viewer',name='Asha Rao')
    asha=c.get('/api/auth/me').json()
    assert asha['name']=='Asha Rao' and asha['role']=='employee' and asha['team_id']==1
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(Employee).where(Employee.email=='asha.rao@flodataanalytics.com'))==1
        assert db.get(Employee,asha['id']).password_hash==''
    # An email already linked to another FloData account is not taken over.
    c.headers['Authorization']='Bearer '+sso_token('asha.rao@flodataanalytics.com','teampulse:viewer',sub='fd-someone-else')
    assert c.get('/api/auth/me').status_code==409
    # Admin-added people still need a company address, and no password.
    import backend.app.core.security as security
    monkeypatch.setattr(security,'ALLOWED_EMAIL_DOMAINS',('flodataanalytics.com',))
    login(c)
    assert c.post('/api/employees',json={'name':'Outside person','email':'someone@example.com','team_id':1}).status_code==422
    added=c.post('/api/employees',json={'name':'Inside person','email':'inside.person@flodataanalytics.com','team_id':1})
    assert added.status_code==201, added.text

def test_team_and_mutation_permissions(ctx):
    c,_=ctx
    login(c,'ananya')
    state=c.get('/api/state').json()
    assert all(p['team_id']==1 for p in state['projects'])
    assert all(p['team_id']==1 for p in state['employees'])
    assert c.patch('/api/work/2',json={'progress':99}).status_code==403
    assert c.patch('/api/work/10',json={'progress':99}).status_code==404
    assert c.post('/api/work',json=work_body(owner=2)).status_code==403
    assert c.post('/api/projects',json={'name':'Forbidden','team_id':1}).status_code==403
    assert c.post('/api/employees',json={'name':'New person','email':'new@example.com','team_id':1}).status_code==403

def test_revision_history_and_owner_confirmation(ctx):
    c,_=ctx
    login(c)
    new=c.post('/api/work',json=work_body()).json()
    due=str(business_day(today(),4))
    assert c.patch('/api/work/'+str(new['id']),json={'due_date':due}).status_code==422
    assert c.patch('/api/work/'+str(new['id']),json={'due_date':due,'note':'Requirements expanded'}).status_code==200
    history=c.get('/api/work/'+str(new['id'])+'/history').json()
    assert len(history)==2 and history[0]['revision']==2
    assert history[1]['due_date']==new['due_date']
    assert c.patch('/api/work/2',json={'due_date':due,'note':'Manager proposal'}).status_code==403

def test_validation_and_priority_reason(ctx):
    c,_=ctx
    login(c)
    assert c.post('/api/work',json=work_body(effort_hours=-2)).status_code==422
    assert c.post('/api/work',json=work_body(due_date=str(today()-timedelta(days=1)))).status_code==422
    assert c.patch('/api/work/1',json={'progress':101}).status_code==422
    assert c.patch('/api/work/1',json={'priority':'Urgent'}).status_code==422
    assert c.patch('/api/work/1',json={'priority':'Urgent','note':'Client priority changed'}).status_code==200
    assert c.patch('/api/work/1',json={'status':'Not a status'}).status_code==422

def test_dependency_delivery_is_not_verification(ctx):
    c,_=ctx
    login(c,'rahul')
    assert c.patch('/api/dependencies/1',json={'status':'Verified'}).status_code==403
    assert c.patch('/api/dependencies/1',json={'status':'Delivered'}).status_code==200
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==3)['status']=='Partially Blocked'
    login(c,'ananya')
    assert c.patch('/api/dependencies/1',json={'status':'Verified'}).status_code==200
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==3)['status']=='In Progress'

def test_multiple_dependencies_and_cycles(ctx):
    c,_=ctx
    login(c,'ananya')
    dep=c.post('/api/dependencies',json={'work_item_id':3,'owner_id':2,'deliverable':'API credentials','due_date':str(today()),'partial':False}).json()
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==3)['status']=='Blocked'
    login(c,'rahul')
    c.patch('/api/dependencies/1',json={'status':'Delivered'})
    login(c,'ananya')
    c.patch('/api/dependencies/1',json={'status':'Verified'})
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==3)['status']=='Blocked'
    assert c.patch('/api/work/3',json={'status':'Completed'}).status_code==409
    c.patch('/api/dependencies/'+str(dep['id']),json={'status':'Cancelled'})
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==3)['status']=='In Progress'
    login(c)
    assert c.post('/api/dependencies',json={'work_item_id':2,'upstream_work_id':5,'owner_id':5,'deliverable':'Circular chain','due_date':str(today())}).status_code==409

def test_assignment_proposal_and_employee_acceptance(ctx):
    c,_=ctx
    login(c)
    assert c.post('/api/work/9/assign',json={'employee_id':6}).status_code==200
    work=next(w for w in c.get('/api/state').json()['work'] if w['id']==9)
    assert not work['commitment_confirmed']
    assert c.patch('/api/work/9',json={'accept_commitment':True}).status_code==403
    login(c,'karan')
    assert c.patch('/api/work/9',json={'accept_commitment':True}).status_code==200
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==9)['commitment_confirmed']

def test_capacity_unknown_and_blocked_effort(ctx):
    _,sessions=ctx
    with sessions() as db:
        priya=db.get(Employee,5)
        c=capacity(db,priya)
        assert c['available'] is None and c['state']=='Unknown' and c['committed']==24
        priya.capacity_confirmed=True
        priya.capacity_confirmed_on=today()
        assert capacity(db,priya)['available']==8
        priya.capacity_confirmed_on=today()-timedelta(days=8)
        assert capacity(db,priya)['available'] is None
        db.get(WorkItem,5).remaining_hours=50
        priya.capacity_confirmed_on=today()
        assert capacity(db,priya)['state']=='Overloaded'

def test_freshness_and_workflow_deduplication(ctx):
    c,sessions=ctx
    with sessions() as db:
        work=db.get(WorkItem,1)
        work.confirmed_at=now()-timedelta(days=3)
        db.scalar(select(Commitment).where(Commitment.work_item_id==1)).due_date=today()
        db.commit()
        run_workflows(db)
        count=db.scalar(select(func.count()).select_from(Notification))
        run_workflows(db)
        assert db.scalar(select(func.count()).select_from(Notification))==count
    login(c)
    item=next(w for w in c.get('/api/state').json()['work'] if w['id']==1)
    assert item['health']=='Progress unconfirmed'

def test_assistant_proposals_are_private_and_idempotent(ctx):
    c,_=ctx
    login(c,'ananya')
    due=next(w for w in c.get('/api/state').json()['work'] if w['id']==7)['due_date']
    moved=str(business_day(today(),6))
    r=c.post('/api/assistant/chat',json={'message':'Move to '+moved+' because the scope grew','work_item_id':7})
    assert r.status_code==200,r.text
    action=r.json()['action']
    assert action and action['status']=='Proposed'  # date moves still wait for confirmation
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==7)['due_date']==due
    path='/api/assistant/actions/'+str(action['id'])+'/decide'
    login(c,'rahul')
    assert c.post(path,json={'approve':True}).status_code==404
    assert c.get('/api/assistant/history').json()['messages']==[]
    login(c,'ananya')
    assert c.post(path,json={'approve':True}).status_code==200
    assert c.post(path,json={'approve':True}).status_code==200
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==7)['due_date']==moved

def test_assistant_create_and_duplicate_prevention(ctx):
    c,_=ctx
    login(c)
    message='Plan: Team planning report; 4 hours; due '+str(business_day(today(),1))+'; project ERP Implementation'
    response=c.post('/api/assistant/chat',json={'message':message}).json()
    assert response['mode']=='offline' and response['action']
    c.post('/api/assistant/actions/'+str(response['action']['id'])+'/decide',json={'approve':True})
    repeat=c.post('/api/assistant/chat',json={'message':message}).json()
    assert repeat['action'] is None and 'already exists' in repeat['reply']

def test_availability_and_notification_ownership(ctx):
    c,_=ctx
    login(c,'ananya')
    assert c.patch('/api/me/availability',json={'weekly_hours':10,'reserved_hours':12,'capacity_confirmed':True,'planning':'Weekly'}).status_code==422
    r=c.patch('/api/me/availability',json={'weekly_hours':36,'reserved_hours':8,'capacity_confirmed':True,'planning':'Weekly'})
    assert r.status_code==200 and r.json()['planning']=='Weekly'
    assert c.post('/api/notifications/9999/read',json={}).status_code==404

def test_business_days_skip_weekends():
    from datetime import date
    assert business_day(date(2026,10,30),2)==date(2026,11,3)

def test_assistant_does_not_infer_completion_from_qualifiers(ctx):
    c,_=ctx
    login(c)
    for text in ['I am not done', 'Almost done', 'I have not finished']:
        response=c.post('/api/assistant/chat',json={'message':text,'work_item_id':1}).json()
        assert response['action'] is None

def test_planning_preferences_respect_existing_commitments(ctx):
    _,sessions=ctx
    with sessions() as db:
        person=db.get(Employee,6)
        person.planning='Daily'
        run_workflows(db)
        assert not db.scalar(select(Notification.id).where(Notification.key.like('planning:6:%')))
        for work in db.scalars(select(WorkItem).where(WorkItem.owner_id==6)):
            work.status='Completed'
        db.flush()
        run_workflows(db)
        assert db.scalar(select(Notification.id).where(Notification.key.like('planning:6:%')))
        count=db.scalar(select(func.count()).select_from(Notification))
        run_workflows(db)
        assert db.scalar(select(func.count()).select_from(Notification))==count
        person.planning='On-demand'
        person.id  # On-demand remains supported without scheduled planning requests.

def test_declining_an_agent_proposal_leaves_work_unchanged(ctx):
    c,_=ctx
    login(c)
    due=next(w for w in c.get('/api/state').json()['work'] if w['id']==1)['due_date']
    action=c.post('/api/assistant/chat',json={'message':'Move to '+str(business_day(today(),6))+' because the scope grew','work_item_id':1}).json()['action']
    result=c.post('/api/assistant/actions/'+str(action['id'])+'/decide',json={'approve':False})
    assert result.json()['status']=='Rejected'
    work=next(w for w in c.get('/api/state').json()['work'] if w['id']==1)
    assert work['due_date']==due and work['progress']==65 and work['remaining_hours']==12
