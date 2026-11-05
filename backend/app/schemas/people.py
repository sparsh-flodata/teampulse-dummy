from typing import Literal
from pydantic import Field, field_validator
from .common import Input, Planning

class Availability(Input):
    weekly_hours: float = Field(ge=0, le=80)
    reserved_hours: float = Field(ge=0, le=80)
    capacity_confirmed: bool
    planning: Planning
    agent_auto_updates: bool = False

class Preferences(Input):
    proactive_checkins: bool | None = None
    pause_until_tomorrow: bool | None = None

class EmployeeCreate(Input):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=256)
    title: str = Field(default='Team member', max_length=120)
    team_id: int
    skills: str = Field(default='', max_length=500)
    role: Literal['employee', 'manager'] = 'employee'
    manager_id: int | None = None

    @field_validator('email')
    @classmethod
    def email_format(cls, value):
        if '@' not in value or '.' not in value.split('@')[-1]:
            raise ValueError('Enter a valid email address.')
        return value.lower()

class EmployeePatch(Input):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    title: str | None = Field(default=None, min_length=2, max_length=120)
    team_id: int | None = None
    manager_id: int | None = None
    role: Literal['employee', 'manager', 'admin'] | None = None
    active: bool | None = None
    skills: str | None = Field(default=None, max_length=500)

class TeamCreate(Input):
    name: str = Field(min_length=2, max_length=120)
    parent_id: int | None = None
    lead_id: int | None = None

class TeamPatch(Input):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    parent_id: int | None = None
    lead_id: int | None = None

class ProjectCreate(Input):
    member_ids: list[int] = Field(default_factory=list, max_length=200)
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default='', max_length=2000)
    team_id: int
    color: Literal['#7256df', '#278d88', '#d58a43', '#c96388'] = '#7256df'
