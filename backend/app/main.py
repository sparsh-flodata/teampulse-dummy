import asyncio
import os
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from backend.app.db.session import engine, SessionLocal
from backend.app.services.work import run_workflows
from backend.app.seed.pilot import seed
from backend.app.db.migrations import migrate
from backend.app.api.router import router
from backend.app.core.config import FRONTEND_DIST, PUBLIC_HOST, PUBLIC_HOST_RESTRICTED, PUBLIC_PATHS
from backend.app.channels.google_chat import process_outbox
from backend.app.services.proactive import run_check_ins

async def workflow_loop():
    while True:
        await asyncio.sleep(60)
        try:
            await asyncio.to_thread(workflow_tick)
        except Exception:
            import logging
            logging.exception('Workflow tick failed; persisted records will be retried on the next tick.')

def workflow_tick():
    with SessionLocal() as db:
        run_workflows(db)
        run_check_ins(db)
        process_outbox(db)

@asynccontextmanager
async def lifespan(app):
    migrate(engine)
    with SessionLocal() as db:
        seed(db)
        if os.getenv('SEED_COMPANY','false').lower()=='true':
            from backend.app.seed.company import seed_company
            seed_company(db)
            db.commit()
        run_workflows(db)
    task = asyncio.create_task(workflow_loop())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task

app = FastAPI(title='TeamPulse API', version='0.4.0', lifespan=lifespan)
origins = os.getenv('ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8787,http://localhost:8787').split(',')
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['GET', 'POST', 'PATCH', 'DELETE'], allow_headers=['Authorization', 'Content-Type', 'X-TeamPulse-Request'])

# Called by Google, authenticated by Google's signed token instead of the app header.
CSRF_EXEMPT = ('/api/integrations/google-chat/events',)

@app.middleware('http')
async def request_guard(request: Request, call_next):
    # Through the public tunnel only the Google Chat endpoint exists; everything else is a 404.
    if PUBLIC_HOST_RESTRICTED and request.headers.get('host', '').split(':')[0].lower() == PUBLIC_HOST and request.url.path not in PUBLIC_PATHS:
        return JSONResponse(status_code=404, content={'detail': 'Not found.'})
    if request.url.path.startswith('/api') and request.method not in ('GET', 'HEAD', 'OPTIONS') and request.url.path not in CSRF_EXEMPT:
        if request.headers.get('X-TeamPulse-Request') != '1' or (request.headers.get('Origin') and request.headers['Origin'] not in origins):
            return JSONResponse(status_code=403, content={'detail': 'This request did not originate from TeamPulse.'})
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['X-Frame-Options'] = 'DENY'
    if request.url.path.startswith('/api'):
        response.headers['Cache-Control'] = 'no-store'
    return response

@app.exception_handler(IntegrityError)
async def integrity_error(request, exc):
    return JSONResponse(status_code=409, content={'detail': 'This record already exists or changed concurrently. Refresh and try again.'})


app.include_router(router)

root = FRONTEND_DIST
if root.exists():
    app.mount('/assets', StaticFiles(directory=root / 'assets'), name='assets')
    @app.get('/{path:path}', include_in_schema=False)
    def frontend(path: str):
        if path.startswith('api/'):
            raise HTTPException(404, 'API route not found.')
        return FileResponse(root / 'index.html')
