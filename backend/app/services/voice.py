"""Voice notes from Google Chat.

A voice note arrives as an audio attachment. TeamPulse downloads it from the Chat API (the app's own credentials),
sends it to the configured provider's speech-to-text endpoint (OpenAI-compatible `/audio/transcriptions`; with Groq,
Whisper), and hands the transcript on exactly as if it had been typed. The audio is never stored, and neither the
audio nor the transcript is logged.
"""
import asyncio
import os
import httpx
from backend.app.channels import google_chat

MAX_BYTES = 20 * 1024 * 1024  # under the provider's upload limit; a voice note is far smaller
TIMEOUT = 25  # Google Chat waits about 30 seconds for the reply


def model() -> str:
    return os.getenv('TRANSCRIBE_MODEL', '').strip() or 'whisper-large-v3-turbo'


def voice_notes(attachments) -> list[dict]:
    """The audio attachments (voice notes) in a Chat message."""
    return [a for a in attachments or [] if isinstance(a, dict)
            and str(a.get('contentType') or '').lower().startswith('audio/')
            and (a.get('attachmentDataRef') or {}).get('resourceName')]


def enabled() -> bool:
    return bool(os.getenv('AI_BASE_URL', '').strip() and os.getenv('AI_API_KEY', '').strip()) and google_chat.outbound_enabled()


async def _transcribe(note: dict) -> str:
    url, headers = await asyncio.to_thread(google_chat.media_request, note['attachmentDataRef']['resourceName'])
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        download = await client.get(url, headers=headers)
        download.raise_for_status()
        audio = download.content
        if len(audio) > MAX_BYTES:
            raise ValueError('voice note too large')
        response = await client.post(
            os.getenv('AI_BASE_URL', '').rstrip('/') + '/audio/transcriptions',
            headers={'Authorization': 'Bearer ' + os.getenv('AI_API_KEY', '')},
            data={'model': model(), 'response_format': 'json', 'temperature': '0'},
            files={'file': (str(note.get('contentName') or 'voice-note.mp3')[:120], audio,
                            str(note.get('contentType') or 'audio/mpeg'))})
        response.raise_for_status()
        return ' '.join(str(response.json().get('text') or '').split())


async def transcribe(note: dict) -> str:
    """The words in a voice note ('' when none were heard). Raises on download, provider or time-limit failures."""
    return await asyncio.wait_for(_transcribe(note), timeout=TIMEOUT)
