from __future__ import annotations

from typing import TYPE_CHECKING

from typing_extensions import override

from earthmind.services.factory import ServiceFactory
from earthmind.services.telemetry_writer.service import TelemetryWriterService

if TYPE_CHECKING:
    from earthmind.services.settings.service import SettingsService


class TelemetryWriterServiceFactory(ServiceFactory):
    def __init__(self) -> None:
        super().__init__(TelemetryWriterService)

    @override
    def create(self, settings_service: SettingsService):
        return TelemetryWriterService(settings_service)
