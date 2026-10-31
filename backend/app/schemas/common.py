from typing import Literal
from pydantic import BaseModel, ConfigDict

Status = Literal['Planned', 'In Progress', 'Partially Blocked', 'Blocked', 'Awaiting Verification', 'Completed']

Priority = Literal['Low', 'Medium', 'High', 'Urgent']

Planning = Literal['Daily', 'Weekly', 'Hybrid', 'On-demand']

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
