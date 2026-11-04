"""Delivery adapters prepare requests inside the database transaction.

External adapters enqueue an outbox message; the workflow tick sends it, so the
request itself never depends on the external service being up.
"""
from dataclasses import dataclass
from typing import Protocol
from backend.app.core.config import APP_URL
from backend.app.models import now
from backend.app.services.work import notify
from backend.app.channels import google_chat


@dataclass(frozen=True)
class DeliveryResult:
    state: str
    detail: str


class DeliveryChannel(Protocol):
    def prepare(self, db, request, sender, recipient) -> DeliveryResult: ...


class InAppChannel:
    def prepare(self, db, request, sender, recipient):
        notify(db, recipient.id, f'update-request:{request.id}', f'{sender.name} requested an update: {request.prompt}')
        request.delivered_at = now()
        return DeliveryResult('Delivered', 'Delivered to the employee’s TeamPulse update inbox.')


class GoogleChatChannel:
    """Always lands in the TeamPulse inbox (where replies can update work), and is
    also sent as a Google Chat DM when the recipient has connected the Chat app."""

    def prepare(self, db, request, sender, recipient):
        InAppChannel().prepare(db, request, sender, recipient)
        text = (f'{sender.name} asked for an update:\n{request.prompt}\n\n'
                f'Reply here in a sentence, or open your inbox: {APP_URL}/chat')
        if google_chat.queue_message(db, recipient.id, text, request.id):
            return DeliveryResult('Delivered', 'Delivered to the TeamPulse update inbox; the Google Chat message is on its way.')
        first = recipient.name.split(' ')[0]
        reason = 'Google Chat is not configured for this workspace' if not google_chat.outbound_enabled() else f'{first} has not connected Google Chat yet'
        return DeliveryResult('Delivered', f'Delivered to the TeamPulse update inbox. {reason}.')


CHANNELS = {'in_app': InAppChannel(), 'google_chat': GoogleChatChannel()}
CHANNEL_LABELS = {'in_app': 'TeamPulse inbox', 'google_chat': 'Google Chat'}
