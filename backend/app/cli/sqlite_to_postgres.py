"""Copy a TeamPulse SQLite database into PostgreSQL.

    python -m backend.app.cli.sqlite_to_postgres data/teampulse.db \
        --target postgresql+psycopg://teampulse:<password>@127.0.0.1:5432/teampulse

The target schema is created and upgraded with the normal migrations first, then
every table the models know is copied row for row (ids preserved), and the id
sequences are moved past the copied rows. The SQLite file is only read.

The target must be empty unless --replace is given, which deletes its rows first.
Cookie sessions (pre-JWT `sessions` table) are not copied: people sign in again.
"""
import argparse
import sys
from sqlalchemy import create_engine, inspect, select, text, func
import backend.app.models  # noqa: F401  registers every table on Base.metadata
from backend.app.db.migrations import migrate
from backend.app.db.session import Base

SKIP = {'schema_migrations'}


def copy(source_url: str, target_url: str, replace: bool = False) -> dict:
    source = create_engine(source_url)
    target = create_engine(target_url)
    if target.dialect.name != 'postgresql':
        raise SystemExit('The target must be a PostgreSQL URL.')
    migrate(target)
    source_tables = set(inspect(source).get_table_names())
    tables = [t for t in Base.metadata.sorted_tables if t.name not in SKIP]
    counts = {}
    with target.begin() as dst:
        occupied = [t.name for t in tables if dst.scalar(select(func.count()).select_from(t))]
        if occupied and not replace:
            raise SystemExit(f'The target already has data in: {", ".join(occupied)}. Use --replace to overwrite it.')
        # Load in any order: foreign keys are checked by the source already, and
        # teams/employees reference each other.
        dst.execute(text('SET session_replication_role = replica'))
        if replace:
            dst.execute(text('TRUNCATE ' + ', '.join(f'"{t.name}"' for t in tables) + ' RESTART IDENTITY CASCADE'))
        with source.connect() as src:
            for table in tables:
                if table.name not in source_tables:
                    counts[table.name] = 0
                    continue
                present = {c['name'] for c in inspect(source).get_columns(table.name)}
                columns = [c for c in table.columns if c.name in present]
                rows = [dict(r._mapping) for r in src.execute(select(*columns))]
                if rows:
                    dst.execute(table.insert(), rows)
                counts[table.name] = len(rows)
        dst.execute(text('SET session_replication_role = DEFAULT'))
        for table in tables:
            pk = list(table.primary_key.columns)
            if len(pk) == 1 and pk[0].autoincrement in (True, 'auto') and pk[0].type.python_type is int:
                dst.execute(text(f"SELECT setval(pg_get_serial_sequence('\"{table.name}\"', '{pk[0].name}'), "
                                 f"COALESCE((SELECT MAX(\"{pk[0].name}\") FROM \"{table.name}\"), 0) + 1, false)"))
    source.dispose()
    target.dispose()
    return counts


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('sqlite_file')
    parser.add_argument('--target', required=True, help='PostgreSQL URL (postgresql+psycopg://...)')
    parser.add_argument('--replace', action='store_true', help='Delete existing rows in the target first.')
    args = parser.parse_args(argv)
    counts = copy('sqlite:///' + args.sqlite_file, args.target, args.replace)
    for name, n in counts.items():
        print(f'{name:20} {n}')
    print(f'Copied {sum(counts.values())} rows.')


if __name__ == '__main__':
    sys.exit(main())
