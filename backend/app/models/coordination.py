from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base
from .base import now


class UpdateRequest(Base):
    __tablename__ = 'update_requests'
    id: Mapped[int] = mapped_column(primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    recipient_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    prompt: Mapped[str] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(30), default='in_app')
    status: Mapped[str] = mapped_column(String(30), default='Queued')
    delivery_detail: Mapped[str] = mapped_column(Text, default='')
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_item_id: Mapped[int | None] = mapped_column(ForeignKey('work_items.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
