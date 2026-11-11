"""Roadmaps: a dummy, UI-first roadmap for every employee.

The data is generated, not stored: the same person always gets the same roadmap (seeded by their id), shaped by
their job title, over the current quarter and the next two. A roadmap is visible to the person and to their seniors
(anyone above them in the reporting line), never to peers or siblings.
"""
import random
from datetime import date
from backend.app.services.work import today

TRACKS = {
    'leadership': ('Team and strategy', [
        'Set the half-year team goals', 'Run quarterly planning with each lead', 'Hire two senior engineers',
        'Introduce a weekly delivery review', 'Coach every lead on feedback', 'Publish the team operating model',
        'Cut cross-team blockers by a third', 'Launch a skills matrix for the team', 'Present the roadmap to leadership',
        'Run a team health survey and act on it']),
    'data': ('Data and insight', [
        'Ship the pilot-region dashboard', 'Automate the weekly KPI report', 'Clean up the customer master data',
        'Document the metrics catalogue', 'Move reports onto the shared warehouse', 'Build the churn early-warning model',
        'Cut dashboard load time in half', 'Train two teams on self-serve reporting', 'Validate the attribution model',
        'Set up data-quality alerts']),
    'engineering': ('Platform and delivery', [
        'Ship the reporting API v2', 'Bring p95 latency under 300 ms', 'Automate the release pipeline',
        'Raise test coverage to 80%', 'Migrate background jobs to the queue', 'Write runbooks for each service',
        'Lead one design review', 'Join the on-call rotation', 'Retire the legacy export module', 'Mentor a new joiner']),
    'design': ('Product experience', [
        'Ship the new onboarding flow', 'Publish the design system v1', 'Run five usability sessions',
        'Redesign the reporting screens', 'Audit accessibility on key pages', 'Prototype the mobile layout',
        'Document interaction patterns', 'Align icons and illustration style', 'Pair with engineering on handoff',
        'Measure task success on the new flow']),
    'product': ('Product outcomes', [
        'Agree the quarter roadmap with stakeholders', 'Ship the pilot-region release', 'Define success metrics per feature',
        'Interview ten customers', 'Groom the backlog to two sprints ahead', 'Launch the release notes page',
        'Cut scope churn per sprint', 'Run a pricing experiment', 'Write the next half-year bet', 'Hold monthly product reviews']),
    'sales': ('Growth and accounts', [
        'Close three pilot-region deals', 'Build the partner pitch deck', 'Grow the qualified pipeline by 20%',
        'Run two customer webinars', 'Refresh the case studies', 'Set up quarterly business reviews',
        'Cut response time on leads to one day', 'Launch the referral programme', 'Map the top 20 accounts',
        'Train on the new product release']),
    'people': ('People and operations', [
        'Roll out the new onboarding checklist', 'Run the engagement survey', 'Document leave and travel policies',
        'Set up the learning budget process', 'Hire for three open roles', 'Launch monthly all-hands notes',
        'Automate expense approvals', 'Refresh the performance review template', 'Organise the team offsite',
        'Build the internal knowledge base']),
    'general': ('Growth plan', [
        'Agree goals with your manager', 'Finish one certification', 'Own a small project end to end',
        'Share a learning session with the team', 'Improve one team process', 'Shadow a teammate in another team',
        'Take on a stretch assignment', 'Write a short case study of your work', 'Give feedback to two peers',
        'Plan the next half-year with your manager']),
}
KEYWORDS = (
    ('leadership', ('head', 'director', 'lead', 'manager', 'vp', 'chief', 'founder', 'ceo', 'cto', 'principal')),
    ('data', ('data', 'analyst', 'analytics', 'scientist', 'insight', ' bi')),
    ('engineering', ('engineer', 'developer', 'dev', 'sde', 'backend', 'frontend', 'devops', 'qa', 'tester', 'architect', 'software')),
    ('design', ('design', 'ux', 'ui ')),
    ('product', ('product', 'project', 'scrum', 'program', 'delivery')),
    ('sales', ('sales', 'marketing', 'business', 'account', 'growth', 'customer')),
    ('people', ('hr', 'people', 'recruit', 'talent', 'operations', 'admin', 'finance', 'office')),
)
KINDS = ('Delivery', 'Skill', 'Impact')
MONTHS = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')


def _track(person) -> str:
    title = ' ' + (person.title or '').casefold() + ' '
    if person.role in ('manager', 'admin'):
        return 'leadership'
    return next((key for key, words in KEYWORDS if any(w in title for w in words)), 'general')


def _quarters(base: date) -> list[tuple[str, int, int]]:
    """(label, year, first month) for this quarter and the next two."""
    first = (base.month - 1) // 3
    out = []
    for i in range(3):
        q = first + i
        year, quarter = base.year + q // 4, q % 4
        out.append((f'Q{quarter + 1} {year}', year, quarter * 3 + 1))
    return out


def _person(p) -> dict:
    return {'id': p.id, 'name': p.name, 'title': p.title, 'color': p.color, 'team_id': p.team_id, 'manager_id': p.manager_id}


def roadmap(person) -> dict:
    rng = random.Random(f'roadmap:{person.id}')
    track = _track(person)
    name, pool = TRACKS[track]
    titles = rng.sample(pool, 9)
    phases = []
    for index, (label, year, month) in enumerate(_quarters(today())):
        if index == 0:
            states = ['done'] * rng.randint(1, 3)
        elif index == 1:
            states = ['done'] if rng.random() < 0.2 else []
            states.append('in_progress')
        else:
            states = []
        states += ['in_progress' if index == 0 else 'planned'] * (3 - len(states))
        milestones = []
        for slot, state in enumerate(states):
            due_month = month + slot
            milestones.append({
                'id': f'{person.id}-{index}-{slot}', 'title': titles[index * 3 + slot], 'kind': rng.choice(KINDS),
                'status': state, 'progress': 100 if state == 'done' else rng.randint(20, 80) if state == 'in_progress' else 0,
                'due': f'{MONTHS[due_month - 1]} {year}'})
        phases.append({'name': label, 'when': ('current', 'next', 'later')[index], 'milestones': milestones})
    every = [m for phase in phases for m in phase['milestones']]
    upcoming = next((m for m in every if m['status'] != 'done'), None)
    return {'person': _person(person), 'track': name, 'phases': phases,
            'percent': round(sum(m['progress'] for m in every) / len(every)),
            'done': sum(m['status'] == 'done' for m in every), 'in_progress': sum(m['status'] == 'in_progress' for m in every),
            'total': len(every), 'next_milestone': upcoming['title'] if upcoming else None}


def summary(person) -> dict:
    data = roadmap(person)
    return {key: data[key] for key in ('person', 'track', 'percent', 'done', 'in_progress', 'total', 'next_milestone')}
