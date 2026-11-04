import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / '.env')
DATA_DIR = ROOT / 'data'
DATA_DIR.mkdir(exist_ok=True)
FRONTEND_DIST = ROOT / 'frontend' / 'dist' / 'client'  # TanStack Start SPA build output

# Public URL people open TeamPulse at; used in links sent through Google Chat.
APP_URL = os.getenv('APP_URL', 'http://127.0.0.1:8787').rstrip('/')

# ---- Identity ---------------------------------------------------------------
# Only these email domains may register or be added as employees.
ALLOWED_EMAIL_DOMAINS = tuple(
    d.strip().lower().lstrip('@')
    for d in os.getenv('ALLOWED_EMAIL_DOMAINS', 'flodataanalytics.com').split(',')
    if d.strip()
)
ACCESS_TOKEN_TTL_SECONDS = int(os.getenv('ACCESS_TOKEN_TTL_SECONDS', '900'))
REFRESH_TOKEN_TTL_DAYS = int(os.getenv('REFRESH_TOKEN_TTL_DAYS', '7'))
# New self-registered people join this team (by name) until an admin moves them.
REGISTRATION_TEAM = os.getenv('REGISTRATION_TEAM', '').strip()


def _jwt_secret() -> str:
    """JWT_SECRET from the environment, else a per-installation secret kept in data/.

    Set JWT_SECRET explicitly in production so every instance signs with the same key.
    """
    configured = os.getenv('JWT_SECRET', '')
    if configured:
        if len(configured) < 32:
            raise RuntimeError('JWT_SECRET must be at least 32 characters.')
        return configured
    path = DATA_DIR / '.jwt-secret'
    if not path.exists():
        path.write_text(secrets.token_urlsafe(64), encoding='utf-8')
    return path.read_text(encoding='utf-8').strip()


JWT_SECRET = _jwt_secret()

# ---- Google Chat --------------------------------------------------------------
# Audience Google puts in the bearer token of each Chat event: the Google Cloud
# project number ("Project number" authentication) or the endpoint URL
# ("HTTP endpoint URL" authentication) chosen in the Chat API configuration.
GOOGLE_CHAT_AUDIENCE = os.getenv('GOOGLE_CHAT_AUDIENCE', '').strip()
# Service-account key (JSON) the app uses to send messages on its own.
GOOGLE_CHAT_SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_CHAT_SERVICE_ACCOUNT_FILE', '').strip()
