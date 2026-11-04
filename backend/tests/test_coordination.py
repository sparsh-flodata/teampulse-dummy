import json
from sqlalchemy import select,func
from test_workflows import ctx,login,HEADERS
from backend.app.models import Employee,WorkItem,Notification,UpdateRequest,AuditEvent,OutboxMessage
from backend.app.seed.company import seed_company,DATA_PATH
from backend.app.core.security import verify_password
from backend.app.api.routes.auth import attempts


def test_chat_request_reaches_inbox_and_reply_updates_work(ctx):
    c,sessions=ctx
    login(c)
    draft=c.post('/api/assistant/chat',json={'message':'Ask Rahul Sharma for an update about API delivery','request_id':'coordinate-0001'}).json()
    assert draft['action']['payload']['kind']=='request_updates'
    assert c.get('/api/update-requests').json()==[]
    approved=c.post('/api/assistant/actions/'+str(draft['action']['id'])+'/decide',json={'approve':True})
    assert approved.status_code==200,approved.text
    request=approved.json()['requests'][0]
    assert request['channel']=='google_chat' and request['status']=='Delivered'
    login(c,'rahul')
    inbox=c.get('/api/update-requests').json()
    assert inbox[0]['can_reply'] and inbox[0]['id']==request['id']
    reply=c.post('/api/update-requests/'+str(request['id'])+'/reply',json={'message':'90% complete, 3 hours remaining','work_item_id':2})
    assert reply.status_code==200,reply.text
    work=next(w for w in c.get('/api/state').json()['work'] if w['id']==2)
    assert work['progress']==90 and work['remaining_hours']==3
    repeated=c.post('/api/update-requests/'+str(request['id'])+'/reply',json={'message':'Do not apply another update','work_item_id':2,'progress':10})
    assert repeated.status_code==200
    assert next(w for w in c.get('/api/state').json()['work'] if w['id']==2)['progress']==90
    login(c)
    assert '90%' in c.get('/api/update-requests').json()[0]['response']
    assert any(n.get('update_request_id')==request['id'] for n in c.get('/api/state').json()['notifications'])


def test_request_permissions_follow_reporting_tree(ctx):
    c,_=ctx
    login(c,'ananya')
    assert c.post('/api/update-requests',json={'recipient_ids':[2]}).status_code==403
    login(c,'rahul')
    assert c.post('/api/update-requests',json={'recipient_ids':[3]}).status_code==403
    assert c.post('/api/update-requests',json={'recipient_ids':[5,6]}).status_code==201
    assert c.post('/api/assistant/chat',json={'message':'Ask Ananya Rao for a status update'}).status_code==403


def test_pending_requests_are_reused_without_duplicate_notifications(ctx):
    c,sessions=ctx
    login(c)
    first=c.post('/api/update-requests',json={'recipient_ids':[2]}).json()[0]
    second=c.post('/api/update-requests',json={'recipient_ids':[2]}).json()[0]
    assert first['id']==second['id']
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(UpdateRequest))==1
        assert db.scalar(select(func.count()).select_from(Notification).where(Notification.key.like('update-request:%')))==1
    assert c.post('/api/update-requests/'+str(first['id'])+'/cancel',json={}).status_code==200
    third=c.post('/api/update-requests',json={'recipient_ids':[2]}).json()[0]
    assert third['id']!=first['id']


def test_google_chat_without_a_connection_still_reaches_the_inbox(ctx):
    c,sessions=ctx
    login(c)
    result=c.post('/api/update-requests',json={'recipient_ids':[2],'channel':'google_chat'})
    assert result.status_code==201,result.text
    request=result.json()[0]
    assert request['status']=='Delivered' and 'Google Chat' in request['delivery_detail']
    with sessions() as db:
        assert db.scalar(select(Notification.id).where(Notification.key==f'update-request:{request["id"]}'))
        assert not db.scalar(select(func.count(OutboxMessage.id)))
    assert c.post('/api/update-requests',json={'recipient_ids':[2],'channel':'whatsapp'}).status_code==422

def test_request_conversations_are_private_to_participants(ctx):
    c,_=ctx
    login(c)
    request=c.post('/api/update-requests',json={'recipient_ids':[2]}).json()[0]
    login(c,'priya')
    assert c.get('/api/update-requests').json()==[]
    assert c.post('/api/update-requests/'+str(request['id'])+'/reply',json={'message':'Not my request'}).status_code==404
    assert c.post('/api/update-requests/'+str(request['id'])+'/cancel',json={}).status_code==404


def test_reporting_changes_prevent_new_private_replies(ctx):
    c,_=ctx
    login(c,'rahul')
    request=c.post('/api/update-requests',json={'recipient_ids':[5]}).json()[0]
    login(c)
    c.patch('/api/employees/5',json={'manager_id':1})
    login(c,'priya')
    response=c.post('/api/update-requests/'+str(request['id'])+'/reply',json={'message':'No longer in this reporting line','work_item_id':5,'progress':70})
    assert response.status_code==403
    login(c,'rahul')
    record=c.get('/api/update-requests').json()[0]
    assert record['access_changed'] and record['response'] is None


def test_request_reply_does_not_modify_someone_elses_work(ctx):
    c,_=ctx
    login(c)
    request=c.post('/api/update-requests',json={'recipient_ids':[2]}).json()[0]
    login(c,'rahul')
    assert c.post('/api/update-requests/'+str(request['id'])+'/reply',json={'message':'An unrelated update','work_item_id':5,'progress':80}).status_code==403
    assert c.post('/api/update-requests/'+str(request['id'])+'/reply',json={'message':'A missing work selection','progress':80}).status_code==422
    assert c.post('/api/update-requests/'+str(request['id'])+'/reply',json={'message':'150% complete','work_item_id':2}).status_code==422


def test_message_receipt_includes_selected_recipients(ctx):
    c,_=ctx
    login(c)
    body={'message':'Ask the selected person for an update','recipient_ids':[2],'request_id':'selected-message-0001'}
    first=c.post('/api/assistant/chat',json=body)
    assert first.status_code==200,first.text
    assert first.json()['action']['payload']['recipient_ids']==[2]
    assert c.post('/api/assistant/chat',json=body|{'recipient_ids':[5]}).status_code==409


def test_all_58_company_accounts_hierarchy_and_samples_are_idempotent(ctx):
    from backend.app.seed.organization import read_organization
    from backend.app.models import Project, Team
    c,sessions=ctx
    rows,_=read_organization()
    with sessions() as db:
        first=seed_company(db);db.commit()
        assert first['created_accounts']==58 and first['sample_work_created']==174
        expected={p['email'] for p in rows}
        people={p.email:p for p in db.scalars(select(Employee)) if p.email in expected}
        assert set(people)==expected and len(people)==58
        assert all(verify_password('test-password-2026!',p.password_hash) for p in people.values())
        teams={t.id:t.name for t in db.scalars(select(Team))}
        for row in rows:
            person=people[row['email']]
            assert teams[person.team_id]==row['department']
            assert person.manager_id==(people[row['manager_email']].id if row['manager_email'] else None)
            assert person.role==row['role']
        assert len(list(db.scalars(select(Project).where(Project.archived.is_(False)))))==8
        original_hash=people['ankita.kushwaha@flodataanalytics.com'].password_hash
        people['ankita.kushwaha@flodataanalytics.com'].title='A custom title to preserve'
        sample=db.scalar(select(WorkItem).where(WorkItem.owner_id==people['ankita.kushwaha@flodataanalytics.com'].id,WorkItem.project_id.in_(select(Project.id).where(Project.archived.is_(False)))))
        sample.title='Renamed sample work to preserve'
        db.commit()
        second=seed_company(db);db.commit()
        assert second['created_accounts']==0 and second['sample_work_created']==0
        assert db.get(WorkItem,sample.id).title=='Renamed sample work to preserve'
        assert people['ankita.kushwaha@flodataanalytics.com'].password_hash==original_hash
        assert people['ankita.kushwaha@flodataanalytics.com'].title=='A custom title to preserve'
        Management=people['ujjwal@flodataanalytics.com'].id
        manager=people['nitish.kumar@flodataanalytics.com'].id
        outsider=people['himanshi.chauhan@flodataanalytics.com'].id
        worker=people['kapil.sharma@flodataanalytics.com'].id
    for email in ('ujjwal@flodataanalytics.com','nitish.kumar@flodataanalytics.com','swati.kashyap@flodataanalytics.com','kapil.sharma@flodataanalytics.com'):
        attempts.clear()
        c.headers.pop('Authorization',None)
        response=c.post('/api/auth/login',json={'email':email,'password':'test-password-2026!'})
        assert response.status_code==200,response.text
        c.headers['Authorization']='Bearer '+response.json()['access_token']
        state=c.get('/api/state').json()
        assert len(state['teams'])==8 and len([p for p in state['directory'] if p['active']])==58
        assert state['organization_source']=='org-tree.json'
        if email=='ujjwal@flodataanalytics.com':
            assert {'green','amber','red'} <= {project['health']['tone'] for project in state['projects']}
        own=c.get('/api/people/'+str(state['user']['id'])+'/profile').json()
        assert len(own['work'])==3
        if email=='nitish.kumar@flodataanalytics.com':
            assert len(state['report_ids'])==7 and outsider not in state['profile_ids']
            assert c.get('/api/people/'+str(outsider)+'/profile').status_code==403
        if email=='kapil.sharma@flodataanalytics.com':
            assert state['profile_ids']==[worker]
            assert c.get('/api/people/'+str(Management)+'/profile').status_code==403
    attempts.clear()
    c.headers['Authorization']='Bearer '+c.post('/api/auth/login',json={'email':'nitish.kumar@flodataanalytics.com','password':'test-password-2026!'}).json()['access_token']
    ambiguity=c.post('/api/assistant/chat',json={'message':'Ask Piyush for a status update'}).json()
    assert ambiguity['action'] is None and 'several teammates' in ambiguity['reply']
    draft=c.post('/api/assistant/chat',json={'message':'Ask Kapil Sharma for an update about planning'}).json()
    assert draft['action']['payload']['kind']=='request_updates'
    assert c.post('/api/assistant/chat',json={'message':'Ask Ankita Kushwaha for an update'}).status_code==403
