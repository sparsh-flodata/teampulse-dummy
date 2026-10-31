"""Create a consistent local SQLite backup without stopping TeamPulse."""
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from backend.app.db.session import engine


def backup():
    if engine.url.get_backend_name() != 'sqlite':
        raise SystemExit('For PostgreSQL, configure pg_dump or your database provider backup service.')
    source=Path(engine.url.database or '').resolve()
    if not source.is_file():
        raise SystemExit('The SQLite database does not exist yet.')
    directory=Path(__file__).resolve().parents[3]/'data'/'backups'
    directory.mkdir(exist_ok=True)
    target=directory/('teampulse-'+datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')+'.db')
    with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as src, closing(sqlite3.connect(target)) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
            raise RuntimeError('Backup integrity verification failed.')
    print('Verified SQLite backup:',target)
    return target


if __name__=='__main__':
    backup()
