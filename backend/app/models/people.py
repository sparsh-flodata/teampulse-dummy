from datetime import datetime, date
from sqlalchemy import String, Text, Float, Boolean, ForeignKey, Date, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base

class Team(Base):
    __tablename__ = 'teams'
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey('teams.id'), nullable=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey('employees.id'), nullable=True)

class Employee(Base):
    __tablename__ = 'employees'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default='employee')
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    agent_auto_updates: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str] = mapped_column(String(120), default='Team member')
    team_id: Mapped[int] = mapped_column(ForeignKey('teams.id'))
    manager_id: Mapped[int | None] = mapped_column(ForeignKey('employees.id'), nullable=True)
    skills: Mapped[str] = mapped_column(Text, default='')
    weekly_hours: Mapped[float] = mapped_column(Float, default=40)
    reserved_hours: Mapped[float] = mapped_column(Float, default=8)
    capacity_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    capacity_confirmed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    planning: Mapped[str] = mapped_column(String(20), default='Hybrid')
    color: Mapped[str] = mapped_column(String(20), default='#7256df')

class AuthSession(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
