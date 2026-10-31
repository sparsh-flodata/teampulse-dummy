from datetime import datetime
from sqlalchemy import String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base
from .base import now

class Notification(Base):
    __tablename__ = 'notifications'
    id: Mapped[int] = mapped_column(primary_key=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    key: Mapped[str] = mapped_column(String(200), unique=True)
    message: Mapped[str] = mapped_column(Text)
    work_item_id: Mapped[int | None] = mapped_column(ForeignKey('work_items.id'), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
