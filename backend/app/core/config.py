import os
import secrets
from urllib.parse import urlparse
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / '.env')
DATA_DIR = ROOT / 'data'
DATA_DIR.mkdir(exist_ok=True)
FRONTEND_DIST = ROOT / 'frontend' / 'dist' / 'client'  # TanStack Start SPA build output

# Public URL people open TeamPulse at; used in links sent through Google Chat.
APP_URL = os.getenv('APP_URL', 'http://127.0.0.1:8787').rstrip('/')
# When APP_URL is a public address (a tunnel or a real host), requests that arrive on
# that host may only reach the paths below, so the app itself is not exposed to the internet
# through a tunnel. Set PUBLIC_HOST_OPEN=true on a real deployment that should serve the app.
PUBLIC_HOST = (urlparse(APP_URL).hostname or '').lower()
PUBLIC_HOST_RESTRICTED = PUBLIC_HOST not in ('', 'localhost', '127.0.0.1') and os.getenv('PUBLIC_HOST_OPEN', 'false').lower() != 'true'
PUBLIC_PATHS = ('/api/integrations/google-chat/events', '/api/health')


def app_link(path: str = '/') -> str:
    """A link to put in outside messages, or '' when the public address does not serve the app."""
    return '' if PUBLIC_HOST_RESTRICTED else APP_URL + path


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
# The URL entered in the Chat API configuration. Workspace add-on style apps put it in the token as the audience.
GOOGLE_CHAT_ENDPOINT = os.getenv('GOOGLE_CHAT_ENDPOINT', APP_URL + '/api/integrations/google-chat/events').strip()
# Service-account key (JSON) the app uses to send messages on its own.
GOOGLE_CHAT_SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_CHAT_SERVICE_ACCOUNT_FILE', '').strip()

# ---- Proactive assistant (docs/PROACTIVE_ASSISTANT_PLAN.md) ----------------------
# Kill switch: when false, nothing is sent to anyone on a schedule.
PROACTIVE_ENABLED = os.getenv('PROACTIVE_ENABLED', 'false').strip().lower() == 'true'
# Dry run: check-ins are composed and stored, but Google Chat messages are not sent.
PROACTIVE_DRY_RUN = os.getenv('PROACTIVE_DRY_RUN', 'true').strip().lower() == 'true'
# Timezone for weekday and check-in hour decisions. Defaults to the app's timezone.
ORG_TIMEZONE = (os.getenv('ORG_TIMEZONE', '').strip() or os.getenv('APP_TIMEZONE', '').strip() or 'Asia/Kolkata')
CHECKIN_HOUR = int(os.getenv('CHECKIN_HOUR', '10'))
CHECKIN_MAX_ITEMS = int(os.getenv('CHECKIN_MAX_ITEMS', '4'))
UNDO_WINDOW_MINUTES = int(os.getenv('UNDO_WINDOW_MINUTES', '120'))
