"""Import the authoritative organization and add a one-time fictional project portfolio."""
from backend.app.seed.organization import import_organization, read_organization, DATA_PATH
from backend.app.seed.collaboration import seed_collaboration


def seed_company(db):
    organization=import_organization(db)
    rows,_=read_organization()
    portfolio=seed_collaboration(db,rows)
    return organization | portfolio | {'existing_accounts':len(rows)-organization['created_accounts']}
