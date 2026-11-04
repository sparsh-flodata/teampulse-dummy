"""Small, versioned, additive migrations for the pilot's SQLite/PostgreSQL schema.
Existing data is preserved. Back up the database before running an upgrade.
"""
import os
from sqlalchemy import inspect, text
import backend.app.models  # Register tables before inspecting Base.metadata.
from backend.app.db.session import Base


def migrate(engine):
    # create_all creates fresh installations and newly introduced tables only.
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, description VARCHAR(200) NOT NULL)'))
        applied = set(conn.execute(text('SELECT version FROM schema_migrations')).scalars())
        additions = {
            'teams': [('parent_id', 'INTEGER REFERENCES teams(id)'), ('lead_id', 'INTEGER REFERENCES employees(id)')],
            'employees': [('active', 'BOOLEAN NOT NULL DEFAULT true'), ('agent_auto_updates', 'BOOLEAN NOT NULL DEFAULT false')],
            'agent_actions': [('base_snapshot', "TEXT NOT NULL DEFAULT '{}'")],
            'conversations': [('agent', "VARCHAR(40) NOT NULL DEFAULT ''")],
        }
        for table, columns in additions.items():
            existing = {c['name'] for c in inspect(conn).get_columns(table)}
            for column, definition in columns:
                if column not in existing:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {definition}'))
        # Upgrade only the unchanged, known local demo hierarchy. Never reparent custom staff.
        if 2 not in applied and os.getenv('SEED_DEMO', '').lower() == 'true':
            root = conn.execute(text("SELECT id FROM employees WHERE email='nitish@teampulse.local' AND manager_id IS NULL AND role='manager'")).scalar()
            if root:
                conn.execute(text("UPDATE employees SET role='admin' WHERE id=:root"), {'root': root})
                lead = conn.execute(text("SELECT id FROM employees WHERE email='rahul@teampulse.local' AND role='employee' AND manager_id=:root"), {'root': root}).scalar()
                if lead:
                    conn.execute(text("UPDATE employees SET role='manager' WHERE id=:lead"), {'lead': lead})
                    conn.execute(text("UPDATE employees SET manager_id=:lead WHERE email IN ('priya@teampulse.local','karan@teampulse.local') AND manager_id=:root"), {'lead': lead, 'root': root})
        if 1 not in applied:
            conn.execute(text("INSERT INTO schema_migrations(version, description) VALUES(1, 'Initial work visibility schema')"))
        if 2 not in applied:
            conn.execute(text("INSERT INTO schema_migrations(version, description) VALUES(2, 'Reporting hierarchy, team structure, and agent receipts')"))
        if 3 not in applied:
            conn.execute(text("INSERT INTO schema_migrations(version, description) VALUES(3, 'Channel-ready employee update requests')"))

        for table in ('teams', 'projects'):
            if 'archived' not in {column['name'] for column in inspect(conn).get_columns(table)}:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false'))
        if 4 not in applied:
            conn.execute(text("INSERT INTO schema_migrations(version, description) VALUES(4, 'Department import and cross-department project participation')"))
        if 5 not in applied:
            # Cookie sessions are replaced by JWT access tokens and rotating refresh tokens.
            # New tables (refresh_tokens, chat_links, channel_outbox) come from create_all above.
            conn.execute(text('DROP TABLE IF EXISTS sessions'))
            conn.execute(text("INSERT INTO schema_migrations(version, description) VALUES(5, 'JWT refresh tokens and the Google Chat channel')"))
