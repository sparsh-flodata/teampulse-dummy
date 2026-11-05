from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.db.session import Base
from .base import now


class Attachment(Base):
    """A file or link sent as evidence for one commitment.

    Stores references only (Google Chat's attachment reference, a Drive file id, or a URL).
    No file bytes are ever written to TeamPulse's own storage.
    """
    __tablename__ = 'attachments'
    __table_args__ = (
        UniqueConstraint('work_item_id', 'source_ref'),
        Index('ix_attachments_project_created', 'project_id', 'created_at'),
        Index('ix_attachments_employee_created', 'employee_id', 'created_at'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    work_item_id: Mapped[int] = mapped_column(ForeignKey('work_items.id'))
    project_id: Mapped[int] = mapped_column(ForeignKey('projects.id'))
    employee_id: Mapped[int] = mapped_column(ForeignKey('employees.id'))
    check_in_id: Mapped[int | None] = mapped_column(ForeignKey('check_ins.id'), nullable=True)
    update_request_id: Mapped[int | None] = mapped_column(ForeignKey('update_requests.id'), nullable=True)
    kind: Mapped[str] = mapped_column(String(20))  # chat_upload, drive_file, link
    name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120), default='')
    url: Mapped[str] = mapped_column(Text, default='')
    thumbnail_url: Mapped[str] = mapped_column(Text, default='')
    source_ref: Mapped[str] = mapped_column(String(255))
    chat_message: Mapped[str] = mapped_column(String(255), default='')
    note: Mapped[str] = mapped_column(String(300), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
