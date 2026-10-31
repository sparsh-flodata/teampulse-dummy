import json
from backend.app.db.session import SessionLocal, engine
from backend.app.db.migrations import migrate
from backend.app.seed.company import seed_company

if __name__=='__main__':
    migrate(engine)
    with SessionLocal() as db:
        result=seed_company(db);db.commit()
    print(json.dumps(result))
