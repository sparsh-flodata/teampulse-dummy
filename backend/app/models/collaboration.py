"""Project participation is independent of an employee's reporting department."""
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base


class ProjectMember(Base):
    __tablename__ = 'project_members'
    project_id: Mapped[int] = mapped_column(ForeignKey('projects.id'), primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'), primary_key=True)


class DemoSetup(Base):
    __tablename__ = 'demo_setup'
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
