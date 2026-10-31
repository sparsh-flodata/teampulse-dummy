from datetime import datetime, date
from sqlalchemy import String, Text, Integer, Float, Boolean, ForeignKey, Date, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base
from .base import now

class Project(Base):
    __tablename__ = 'projects'
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str] = mapped_column(Text, default='')
    team_id: Mapped[int] = mapped_column(ForeignKey('teams.id'))
    color: Mapped[str] = mapped_column(String(20), default='#7256df')

class WorkItem(Base):
    __tablename__ = 'work_items'
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default='')
    project_id: Mapped[int] = mapped_column(ForeignKey('projects.id'))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey('employees.id'), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default='Planned')
    priority: Mapped[str] = mapped_column(String(20), default='Medium')
    progress: Mapped[int] = mapped_column(Integer, default=0)
    risk: Mapped[bool] = mapped_column(Boolean, default=False)
    remaining_hours: Mapped[float] = mapped_column(Float, default=4)
    required_skills: Mapped[str] = mapped_column(Text, default='')
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Commitment(Base):
    __tablename__ = 'commitments'
    __table_args__ = (UniqueConstraint('work_item_id', 'revision'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    work_item_id: Mapped[int] = mapped_column(ForeignKey('work_items.id'))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)
    effort_hours: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(Text, default='Initial commitment')
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey('employees.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Dependency(Base):
    __tablename__ = 'dependencies'
    id: Mapped[int] = mapped_column(primary_key=True)
    work_item_id: Mapped[int] = mapped_column(ForeignKey('work_items.id'))
    upstream_work_id: Mapped[int | None] = mapped_column(ForeignKey('work_items.id'), nullable=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    owner_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    deliverable: Mapped[str] = mapped_column(String(200))
    reason: Mapped[str] = mapped_column(Text, default='')
    due_date: Mapped[date] = mapped_column(Date)
    impact: Mapped[str] = mapped_column(String(20), default='High')
    partial: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(30), default='Requested')
    previous_work_status: Mapped[str] = mapped_column(String(30), default='In Progress')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class AuditEvent(Base):
    __tablename__ = 'audit_events'
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    work_item_id: Mapped[int | None] = mapped_column(ForeignKey('work_items.id'), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
