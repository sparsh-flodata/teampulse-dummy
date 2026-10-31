from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base
from .base import now

class AgentAction(Base):
    __tablename__ = 'agent_actions'
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    payload: Mapped[str] = mapped_column(Text)
    base_snapshot: Mapped[str] = mapped_column(Text, default='{}')
    status: Mapped[str] = mapped_column(String(20), default='Proposed')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Conversation(Base):
    __tablename__ = 'conversations'
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    role: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class MessageReceipt(Base):
    __tablename__ = 'message_receipts'
    __table_args__ = (UniqueConstraint('employee_id', 'request_id'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    request_id: Mapped[str] = mapped_column(String(120))
    fingerprint: Mapped[str] = mapped_column(String(64))
    response_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
