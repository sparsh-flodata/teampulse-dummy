from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / '.env')
DATA_DIR = ROOT / 'data'
DATA_DIR.mkdir(exist_ok=True)
FRONTEND_DIST = ROOT / 'frontend' / 'dist' / 'client'  # TanStack Start SPA build output
