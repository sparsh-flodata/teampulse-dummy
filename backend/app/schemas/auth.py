from pydantic import Field, field_validator
from .common import Input


class Login(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class Register(Input):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=256)

    @field_validator('email')
    @classmethod
    def email_format(cls, value):
        value = value.strip().lower()
        if value.count('@') != 1 or '.' not in value.split('@')[-1]:
            raise ValueError('Enter a valid email address.')
        return value


class RefreshInput(Input):
    refresh_token: str = Field(min_length=20, max_length=200)
