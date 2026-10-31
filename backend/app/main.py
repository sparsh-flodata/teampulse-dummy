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
from backend.app.core.config import FRONTEND_DIST

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

app = FastAPI(title='TeamPulse API', version='0.3.0', lifespan=lifespan)
origins = os.getenv('ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8787,http://localhost:8787').split(',')
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['GET', 'POST', 'PATCH'], allow_headers=['Content-Type', 'X-TeamPulse-Request'])

@app.middleware('http')
async def request_guard(request: Request, call_next):
    if request.url.path.startswith('/api') and request.method not in ('GET', 'HEAD', 'OPTIONS'):
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
