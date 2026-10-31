import json
import pytest
from sqlalchemy import select
from test_workflows import ctx,login
from backend.app.models import Employee,Project,ProjectMember,WorkItem,Team
from backend.app.seed.company import seed_company
from backend.app.seed.organization import read_organization,import_organization
from backend.app.services.work import capacity


def test_explicit_project_participation_shares_work_without_private_profiles(ctx):
    c,_=ctx
    login(c)
    project=c.post('/api/projects',json={'name':'Cross-department delivery','team_id':1,'member_ids':[7]})
    assert project.status_code==201,project.text
    pid=project.json()['id']
    due=c.get('/api/state').json()['today']
    own=c.post('/api/work',json={'title':'Operations handover','project_id':pid,'owner_id':7,'effort_hours':4,'due_date':due})
    peer=c.post('/api/work',json={'title':'Engineering API contract','project_id':pid,'owner_id':3,'effort_hours':6,'due_date':due})
    assert own.status_code==201 and peer.status_code==201
    login(c,'sara')
    state=c.get('/api/state').json()
    assert pid in {p['id'] for p in state['projects']}
    assert {own.json()['id'],peer.json()['id']} <= {w['id'] for w in state['work']}
    assert 1 not in {w['id'] for w in state['work']}  # An unrelated Engineering project stays private.
    assert c.get('/api/people/3/profile').status_code==403
    assert c.patch('/api/work/'+str(peer.json()['id']),json={'progress':50}).status_code==403
    created=c.post('/api/work',json={'title':'Operations acceptance evidence','project_id':pid,'owner_id':7,'effort_hours':2,'due_date':due})
    assert created.status_code==201,created.text
    dep=c.post('/api/dependencies',json={'work_item_id':own.json()['id'],'owner_id':3,'deliverable':'Reviewed API schema','due_date':due,'partial':True})
    assert dep.status_code==201,dep.text
    login(c,'ananya')
    assert c.patch('/api/dependencies/'+str(dep.json()['id']),json={'status':'Delivered'}).status_code==200


def test_archive_preserves_records_but_excludes_live_work_and_capacity(ctx):
    c,sessions=ctx
    login(c,'ananya')
    before=c.get('/api/people/3/profile').json()
    assert before['work']
    with sessions() as db:
        db.get(Project,2).archived=True
        db.commit()
        assert db.get(WorkItem,3) is not None
        assert capacity(db,db.get(Employee,3))['committed']==0
    state=c.get('/api/state').json()
    assert 2 not in {p['id'] for p in state['projects']}
    assert not any(w['project_id']==2 for w in state['work'])
    assert c.get('/api/people/3/profile').json()['work']==[]
    assert c.get('/api/work/3/history').status_code==404


def test_org_parser_rejects_duplicates_before_any_import(ctx,tmp_path):
    _,sessions=ctx
    node={'name':'Example','email':'duplicate@example.com','department':'One','children':[]}
    source=tmp_path/'invalid.json';source.write_text(json.dumps([node,node]))
    with sessions() as db:
        original=list(db.scalars(select(Employee.email)))
        with pytest.raises(ValueError,match='unique'):
            import_organization(db,source)
        assert list(db.scalars(select(Employee.email)))==original
    bad=tmp_path/'bad.json';bad.write_text(json.dumps([node|{'children':{}}]))
    with pytest.raises(ValueError,match='array'):
        read_organization(bad)


def test_changed_org_source_reparents_only_after_validating_and_preserves_passwords(ctx,tmp_path):
    _,sessions=ctx
    from backend.app.seed.organization import DATA_PATH
    tree=json.loads(DATA_PATH.read_text(encoding='utf-8-sig'))
    def flatten(nodes):
        return [p for node in nodes for p in [node,*flatten(node['children'])]]
    nodes={p['email']:p for p in flatten(tree)}
    kush=nodes['kush.prakhar@flodataanalytics.com']
    vikas=nodes['vikas@flodataanalytics.com']
    kush['children'].remove(vikas)
    nodes['nitish.kumar@flodataanalytics.com']['children'].append(vikas)
    source=tmp_path/'changed.json';source.write_text(json.dumps(tree))
    with sessions() as db:
        seed_company(db);db.commit()
        person=db.scalar(select(Employee).where(Employee.email==vikas['email']))
        old_hash=person.password_hash
        expected=db.scalar(select(Employee).where(Employee.email=='nitish.kumar@flodataanalytics.com'))
        result=import_organization(db,source);db.commit()
        assert result['changed'] and person.manager_id==expected.id
        assert db.get(Team,person.team_id).name=='Data Science'
        assert person.password_hash==old_hash
        person.title='Edited after import';db.commit()
        assert not import_organization(db,source)['changed']
        assert person.title=='Edited after import'
