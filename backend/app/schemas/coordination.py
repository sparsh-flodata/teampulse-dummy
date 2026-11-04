from typing import Literal
from pydantic import Field
from .common import Input, Status


class UpdateRequestCreate(Input):
    recipient_ids: list[int] = Field(min_length=1, max_length=100)
    prompt: str = Field(default='Please share your current progress, expected completion, and any blockers.', min_length=3, max_length=2000)
    channel: Literal['in_app', 'google_chat'] = 'in_app'


class UpdateReply(Input):
    message: str = Field(min_length=3, max_length=4000)
    work_item_id: int | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    remaining_hours: float | None = Field(default=None, ge=0, le=1000)
    status: Status | None = None
