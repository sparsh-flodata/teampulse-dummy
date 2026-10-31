import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.app.core.config import ROOT
from sqlalchemy.engine import make_url
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data/teampulse.db')
parsed = make_url(DATABASE_URL)
if parsed.get_backend_name() == 'sqlite' and parsed.database not in (None, '', ':memory:'):
    database = Path(parsed.database)
    if not database.is_absolute():
        DATABASE_URL = str(parsed.set(database=str(ROOT / database)))
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {}, pool_pre_ping=True)
if DATABASE_URL.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def enable_foreign_keys(conn, _):
        conn.execute('PRAGMA foreign_keys=ON')

class Base(DeclarativeBase):
    pass

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

def get_db():
    with SessionLocal() as db:
        yield db
