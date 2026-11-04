from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base
from .base import now


class ChatLink(Base):
    """An employee's direct-message space with the TeamPulse Google Chat app.

    Created when the person adds or messages the app; Google asserts their
    email, which must match an active TeamPulse account.
    """
    __tablename__ = 'chat_links'
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'), primary_key=True)
    google_user: Mapped[str] = mapped_column(String(120), unique=True)  # users/{id}
    space: Mapped[str] = mapped_column(String(120))  # spaces/{id}
    linked_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class OutboxMessage(Base):
    """A message waiting to go out through an external channel.

    Written inside the business transaction; the workflow tick sends it, so a
    failed delivery never rolls back the request that caused it.
    """
    __tablename__ = 'channel_outbox'
    id: Mapped[int] = mapped_column(primary_key=True)
    channel: Mapped[str] = mapped_column(String(30))
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    update_request_id: Mapped[int | None] = mapped_column(ForeignKey('update_requests.id'), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default='Pending')  # Pending, Sent, Failed
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
