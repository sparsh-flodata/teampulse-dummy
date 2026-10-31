from pydantic import Field
from .common import Input

class ChatInput(Input):
    message: str = Field(min_length=1, max_length=4000)
    work_item_id: int | None = None
    recipient_ids: list[int] = Field(default_factory=list,max_length=100)
    request_id: str | None = Field(default=None, min_length=8, max_length=120)

class Decision(Input):
    approve: bool
