from fastapi import APIRouter
from .routes import auth, workspace, work, dependencies, people, projects, notifications, assistant, organization, profiles, coordination, integrations, attachments, checkins

router = APIRouter()
for resource in (auth, workspace, work, dependencies, people, projects, notifications, assistant, organization, profiles, coordination, integrations, attachments, checkins):
    router.include_router(resource.router)
