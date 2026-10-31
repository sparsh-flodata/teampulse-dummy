"""Delivery adapters prepare requests inside the database transaction.
A future external adapter must enqueue an outbox job and verify its sender/reply identity.
"""
from dataclasses import dataclass
from typing import Protocol
from backend.app.models import now
from backend.app.services.work import notify


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


class UnconfiguredChannel:
    def prepare(self, db, request, sender, recipient):
        return DeliveryResult('Queued', 'WhatsApp is not configured. No external message has been sent.')


CHANNELS = {'in_app': InAppChannel(), 'whatsapp': UnconfiguredChannel()}
