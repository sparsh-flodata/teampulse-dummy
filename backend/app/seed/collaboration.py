"""Reproducible fictional delivery portfolio. Imported reporting lines are authoritative.
Sample work is created once; later edits and replies are never reset by startup.
"""
from collections import defaultdict
from datetime import timedelta
import random
from sqlalchemy import select
from backend.app.models import (Employee, Team, Project, ProjectMember, WorkItem, Commitment,
    Dependency, AuditEvent, Notification, UpdateRequest, DemoSetup, now)
from backend.app.services.work import today, business_day, notify

PORTFOLIO = [
    ('Atlas Retail Intelligence', 'Engineering and Analytics', '#7256df', ['Engineering and Analytics','Data Science','GIS','Solutions','Growth','Management'], 'Store catchment insights and weekly sales forecasting for a retail expansion pilot. Milestone: regional dashboard and forecast sign-off.'),
    ('Terra Network Coverage', 'GIS', '#278d88', ['GIS','Data Science','Engineering and Analytics','Solutions','Management'], 'Coverage-gap mapping and site prioritization for a telecom rollout. Milestone: validated geospatial layers and client review.'),
    ('FlowOps Client Portal', 'Solutions', '#627fbe', ['Solutions','Engineering and Analytics','Data Science','Growth','Accounts','Management'], 'A client portal for service requests, delivery reports, and billing visibility. Milestone: UAT-ready release with secure APIs.'),
    ('RevenuePulse Q4 Planning', 'Growth', '#d58a43', ['Growth','Accounts','Data Science','Management'], 'A fictional pipeline, pricing, and revenue planning exercise. Milestone: reconciled forecast and campaign launch approval.'),
    ('TalentHub Onboarding', 'HR & Admin', '#c96388', ['HR & Admin','Engineering and Analytics','Accounts','Management'], 'An onboarding workflow joining people operations, provisioning, and payroll checks. Milestone: tested new-starter checklist.'),
    ('InsightLake Data Platform', 'Data Science', '#278d88', ['Data Science','Engineering and Analytics','Solutions','Management'], 'Shared ingestion, quality controls, and governed analytics datasets. Milestone: reliable incremental refresh and documented contracts.'),
    ('Client Launch Readiness', 'Solutions', '#7256df', ['Solutions','GIS','Growth','HR & Admin','Management'], 'Coordinated training, acceptance, and handover for a sample enterprise rollout. Milestone: client acceptance and support readiness.'),
    ('Business Operations Refresh', 'Accounts', '#8d75a6', ['Accounts','HR & Admin','Engineering and Analytics','Management'], 'Internal purchasing, access requests, and finance reconciliation improvements. Milestone: documented approvals and exception reporting.'),
]
TASKS = {
 'Management': ['Approve rollout scope and success measures','Review delivery risks with workstream owners','Sign off the release readiness checklist','Agree escalation decisions and recovery plan','Review stakeholder feedback and priorities','Approve the milestone acceptance package'],
 'Growth': ['Validate client discovery notes and market segments','Prepare the demo storyline and product positioning','Review campaign attribution and conversion assumptions','Finalize the proposal scope and pricing narrative','Coordinate stakeholder interviews and feedback','Prepare the customer launch communication plan','Review renewal opportunities and sales handover','Validate the business case and expected outcomes'],
 'Data Science': ['Reconcile source records and missing-value rules','Build and compare baseline forecasting models','Validate holdout accuracy and error segments','Publish the curated analytical dataset','Review feature leakage and model assumptions','Implement incremental ingestion quality checks','Profile outliers and investigate data drift','Document metric definitions and lineage','Tune aggregation queries for dashboard refresh','Validate entity matching and deduplication rules','Prepare a reproducible evaluation notebook','Reconcile operational totals against source extracts','Review forecast explanations for business users','Add monitoring for freshness and completeness','Package the model scoring and evaluation report'],
 'Engineering and Analytics': ['Implement authenticated reporting API endpoints','Build the delivery dashboard filters and drilldowns','Add incremental refresh orchestration and retries','Create automated contract and integration checks','Optimize dashboard query latency and caching','Implement role-aware portal navigation','Prepare the release candidate and smoke tests','Validate exports and scheduled reporting outputs','Instrument ingestion failures and alert routing','Review API schemas and database migrations'],
 'GIS': ['Validate coordinate systems and geometry quality','Publish the versioned coverage and boundary layers','Build catchment overlays and spatial joins','Review candidate sites and coverage gaps','Optimize vector tiles and map rendering','Reconcile address matches and geocoding exceptions','Prepare the map legend and client review package','Validate distance bands and regional summaries'],
 'Accounts': ['Reconcile the sample invoice and delivery register','Validate tax and purchase-order fields for handover','Review the pricing workbook and margin assumptions','Check vendor onboarding and approval evidence','Prepare month-end reconciliation exceptions','Document finance approval and billing controls'],
 'Solutions': ['Confirm acceptance criteria with stakeholders','Map the current process and integration touchpoints','Prepare the client UAT scripts and sample records','Validate the end-to-end delivery workflow','Coordinate the pilot review and issue triage','Document the service handover and runbook','Review edge cases and business validation rules','Prepare the training walkthrough and user guide','Reconcile the requirements traceability matrix','Coordinate release readiness and dependency owners','Validate operational reports against agreed metrics','Record client feedback and prioritize follow-up fixes'],
 'HR & Admin': ['Validate the new-starter checklist and approval owners','Coordinate training schedules and access requests','Review the policy acknowledgement workflow','Prepare the onboarding guidance and help content','Reconcile employee provisioning and payroll inputs','Confirm support coverage and escalation contacts'],
}
SKILLS = {'Management':'Delivery planning, Stakeholder management','Growth':'Discovery, Campaign analytics, Proposals','Data Science':'Python, SQL, Forecasting, Data quality','Engineering and Analytics':'TypeScript, Python, APIs, Analytics','GIS':'GIS, Spatial SQL, Geospatial analysis','Accounts':'Reconciliation, Financial controls, Excel','Solutions':'Requirements, UAT, Integration, Client delivery','HR & Admin':'Onboarding, Operations, Training'}


def seed_collaboration(db, rows):
    if db.get(DemoSetup, 'collaborative_portfolio_v1'):
        balance_portfolio_health(db)
        return {'sample_work_created':0, 'projects_created':0}
    rng = random.Random(20261031)
    people = {p.email:p for p in db.scalars(select(Employee))}
    teams = {t.name:t for t in db.scalars(select(Team))}
    # Preserve the original pilot and generic sample work as archived project history.
    for project in db.scalars(select(Project)):
        if project.name.endswith(' · Delivery') or project.name in {'ERP Implementation','GeoInsights','AI Automation','Internal Operations'}:
            project.archived = True
    projects = {}
    for name, department, color, participants, description in PORTFOLIO:
        project = db.scalar(select(Project).where(Project.name==name))
        if not project:
            project = Project(name=name, team_id=teams[department].id, color=color, description='DEMO PROJECT · '+description)
            db.add(project); db.flush()
        projects[name]=project
    dept_index = defaultdict(int)
    by_project = defaultdict(list)
    by_person = defaultdict(list)
    member_pairs = set()
    stamp = now()
    for index, row in enumerate(rows):
        person=people[row['email']]; department=row['department']
        person.skills=SKILLS[department]
        person.reserved_hours=8+(index%3)*2
        person.capacity_confirmed=index%8!=0
        person.capacity_confirmed_on=today() if person.capacity_confirmed else None
        choices=[p for p in PORTFOLIO if department in p[3]]
        local=dept_index[department];dept_index[department]+=1
        for slot in range(3):
            spec=choices[(local+slot)%len(choices)];project=projects[spec[0]]
            title=TASKS[department][(local*3+slot)%len(TASKS[department])]
            focus=['Pilot region','Release 1','Client review','Quality gate','Data refresh','UAT cycle'][(local+slot)%6]
            progress=rng.choice([0,20,35,55,70,85,100])
            complete=progress==100
            status='Completed' if complete else 'Planned' if progress==0 else 'Awaiting Verification' if progress==85 and index%4==0 else 'In Progress'
            remaining=0 if complete else rng.choice([2,3,4,6,8,12,16])
            overdue=(index+slot)%19==0 and not complete
            due=today()-timedelta(days=2) if overdue else business_day(today(),1+(index+slot)%8)
            work=WorkItem(title=title+' · '+focus, description='Fictional demo scenario. '+spec[4]+' Acceptance: evidence is reviewed, exceptions are documented, and the output is usable by the next workstream.', project_id=project.id, owner_id=person.id, status=status, priority='High' if (index+slot)%5==0 else 'Medium', progress=progress, remaining_hours=remaining, required_skills=SKILLS[department].split(',')[0],risk=overdue,confirmed_at=stamp-timedelta(hours=52 if index%10==0 else 3),created_at=stamp-timedelta(days=5+slot))
            db.add(work);db.flush()
            initial_due=business_day(due,1) if index%9==0 and slot==0 else due
            db.add(Commitment(work_item_id=work.id,start_date=today()-timedelta(days=7),due_date=initial_due,effort_hours=max(4,remaining+4),confirmed_by=None if index%11==0 and not complete else person.id,reason='Agreed demo milestone and acceptance criteria.',created_at=stamp-timedelta(days=5)))
            if initial_due!=due:
                db.add(Commitment(work_item_id=work.id,revision=2,start_date=today()-timedelta(days=7),due_date=due,effort_hours=max(4,remaining+4),confirmed_by=person.id,reason='Sample change: align handover with the client review window.',created_at=stamp-timedelta(days=1)))
            db.add_all([AuditEvent(actor_id=person.id,work_item_id=work.id,message='Agreed scope, acceptance criteria, and handover owner for this demo milestone.',created_at=stamp-timedelta(days=5)),AuditEvent(actor_id=person.id,work_item_id=work.id,message=f'Progress update: {progress}% complete; {remaining}h remaining. '+('Deliverable confirmed complete.' if complete else 'Review notes and validation evidence added.'),created_at=stamp-timedelta(hours=3+slot))])
            by_project[project.id].append((person,work));by_person[person.id].append(work)
            member_pairs.add((project.id,person.id))
    db.add_all([ProjectMember(project_id=pid,employee_id=eid) for pid,eid in sorted(member_pairs) if not db.get(ProjectMember,(pid,eid))])
    db.flush()
    dependency_count=0
    for project_id, pairs in by_project.items():
        active=[pair for pair in pairs if pair[1].status not in ('Completed','Awaiting Verification')]
        used=set()
        for slot in range(2):
            consumer=next((pair for pair in reversed(active) if pair[1].id not in used),None)
            if not consumer:continue
            provider=next((pair for pair in active if pair[0].team_id!=consumer[0].team_id and pair[1].id not in used and pair[1].id!=consumer[1].id),None)
            if not provider:continue
            requester,work=consumer;owner,upstream=provider;used.update((work.id,upstream.id))
            status='Delivered' if project_id%3==0 and slot==1 else 'At Risk' if slot==1 and project_id%2==0 else 'Accepted'
            due=today()-timedelta(days=1) if status=='At Risk' else business_day(today(),1+slot)
            dep=Dependency(work_item_id=work.id,upstream_work_id=upstream.id,requester_id=requester.id,owner_id=owner.id,deliverable='Reviewed handover: '+upstream.title,reason='The downstream workstream needs the validated output before its acceptance review. This is a fictional collaboration scenario.',due_date=due,impact='High',partial=slot==1,status=status,previous_work_status=work.status)
            db.add(dep);db.flush();work.status='Partially Blocked' if dep.partial else 'Blocked'
            notify(db,owner.id,f'demo-handover:{dep.id}',f'{requester.name} needs your reviewed output for {db.get(Project,project_id).name}.',work.id)
            db.add(AuditEvent(actor_id=requester.id,work_item_id=work.id,message=f'Coordinating handover with {owner.name} across departments. Dependency: {status}.',created_at=stamp-timedelta(hours=2)))
            dependency_count+=1
    # Give every non-root employee an incoming manager exchange to explore across logins.
    for index,row in enumerate(rows):
        if not row['manager_email']:continue
        employee=people[row['email']];sender=people[row['manager_email']];work=by_person[employee.id][0]
        answered=index%3==0
        request=UpdateRequest(requester_id=sender.id,recipient_id=employee.id,prompt='Demo check-in: please share progress, the next handover, and any blockers for '+db.get(Project,work.project_id).name+'.',channel='in_app',status='Responded' if answered else 'Delivered',delivery_detail='Delivered to the TeamPulse update inbox (sample scenario).',created_at=stamp-timedelta(hours=5),delivered_at=stamp-timedelta(hours=5),response=f'Sample update: {work.progress}% complete, {work.remaining_hours:g} hours remaining. '+('A handover needs coordination.' if work.status in ('Blocked','Partially Blocked') else 'Next step is the acceptance review.') if answered else None,work_item_id=work.id if answered else None,responded_at=stamp-timedelta(hours=3) if answered else None)
        db.add(request);db.flush()
        notify(db,sender.id if answered else employee.id,f'update-response:{request.id}' if answered else f'update-request:{request.id}',f'{employee.name} replied to a demo check-in.' if answered else f'{sender.name} requested a demo milestone update.',work.id)
    balance_portfolio_health(db)
    db.merge(DemoSetup(key='collaborative_portfolio_v1',value='created'))
    db.flush()
    return {'sample_work_created':sum(map(len,by_person.values())),'projects_created':len(projects),'dependencies_created':dependency_count}


def balance_portfolio_health(db):
    """A one-time demo setup step: include healthy and review-ready project scenarios."""
    if db.get(DemoSetup, 'portfolio_health_v1'):
        return
    healthy={'RevenuePulse Q4 Planning','TalentHub Onboarding','Business Operations Refresh'}
    review={'InsightLake Data Platform'}
    projects=list(db.scalars(select(Project).where(Project.name.in_(healthy | review))))
    for project in projects:
        works=list(db.scalars(select(WorkItem).where(WorkItem.project_id==project.id)))
        for work in works:
            work.risk=False;work.confirmed_at=now()-timedelta(hours=2)
            commitments=list(db.scalars(select(Commitment).where(Commitment.work_item_id==work.id)))
            for commitment in commitments:
                commitment.confirmed_by=work.owner_id
                if commitment.due_date<today():commitment.due_date=business_day(today(),3)
            if project.name in healthy and work.status in ('Blocked','Partially Blocked','Awaiting Verification'):
                work.status='In Progress'
        for dependency in db.scalars(select(Dependency).where(Dependency.work_item_id.in_([w.id for w in works]))):
            dependency.status='Verified' if project.name in healthy else 'Accepted'
            dependency.partial=True
            dependency.due_date=business_day(today(),2)
        if project.name in review:
            for work in works:
                if work.status=='Blocked':work.status='Partially Blocked'
    db.merge(DemoSetup(key='portfolio_health_v1',value='created'))
    db.flush()
