from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base
from .base import now


class CheckIn(Base):
    """One conversation thread the assistant opened with a person.

    kind 'daily': one per person per day; period is the date (YYYY-MM-DD).
    kind 'request': answers a manager's update request; period is the request id.
    The unique (employee_id, kind, period) constraint stops duplicates even if two ticks race.
    """
    __tablename__ = 'check_ins'
    __table_args__ = (UniqueConstraint('employee_id', 'kind', 'period'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    kind: Mapped[str] = mapped_column(String(20))  # daily, request
    period: Mapped[str] = mapped_column(String(20))
    update_request_id: Mapped[int | None] = mapped_column(ForeignKey('update_requests.id'), nullable=True)
    items_json: Mapped[str] = mapped_column(Text, default='[]')
    status: Mapped[str] = mapped_column(String(20), default='Open')  # Open, Clarifying, Confirming, Done, Expired
    clarify_rounds: Mapped[int] = mapped_column(Integer, default=0)
    pending_json: Mapped[str] = mapped_column(Text, default='{}')
    message: Mapped[str] = mapped_column(Text, default='')  # the composed check-in, for the admin preview
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
