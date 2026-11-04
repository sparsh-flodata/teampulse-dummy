from datetime import date
from typing import Literal
from pydantic import Field
from .common import Input, Status, Priority

class NewDependency(Input):
    """A dependency recorded together with a new commitment (the commitment is the requester)."""
    owner_id: int
    deliverable: str = Field(min_length=3, max_length=200)
    reason: str = Field(default='', max_length=2000)
    due_date: date
    impact: Literal['Low', 'Medium', 'High', 'Critical'] = 'High'
    partial: bool = True
    effort_hours: float = Field(default=4, gt=0, le=1000)


class WorkCreate(Input):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default='', max_length=4000)
    project_id: int
    owner_id: int | None = None
    priority: Priority = 'Medium'
    due_date: date
    effort_hours: float = Field(default=4, gt=0, le=1000)
    required_skills: str = Field(default='', max_length=500)
    dependencies: list[NewDependency] = Field(default_factory=list, max_length=10)

class WorkPatch(Input):
    status: Status | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    remaining_hours: float | None = Field(default=None, ge=0, le=1000)
    due_date: date | None = None
    priority: Priority | None = None
    risk: bool | None = None
    note: str = Field(default='', max_length=4000)
    accept_commitment: bool = False

class DependencyCreate(Input):
    work_item_id: int
    upstream_work_id: int | None = None
    owner_id: int
    deliverable: str = Field(min_length=3, max_length=200)
    reason: str = Field(default='', max_length=2000)
    due_date: date
    impact: Literal['Low', 'Medium', 'High', 'Critical'] = 'High'
    partial: bool = True
    # Effort for the commitment created for the dependency owner (ignored when upstream work is linked).
    effort_hours: float = Field(default=4, gt=0, le=1000)

class DependencyPatch(Input):
    status: Literal['Requested', 'Accepted', 'In Progress', 'At Risk', 'Blocked', 'Delivered', 'Verified', 'Cancelled']

class Assignment(Input):
    employee_id: int
