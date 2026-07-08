"""Authorization service factory."""

from __future__ import annotations

from typing import TYPE_CHECKING

from earthmind.services.factory import ServiceFactory
from earthmind.services.schema import ServiceType

if TYPE_CHECKING:
    from lfx.services.authorization.base import BaseAuthorizationService
    from lfx.services.settings.service import SettingsService

    from earthmind.services.authorization.service import EarthMindAuthorizationService


class AuthorizationServiceFactory(ServiceFactory):
    """Factory that creates the EarthMind authorization service."""

    name = ServiceType.AUTHORIZATION_SERVICE.value

    service_class: type[EarthMindAuthorizationService]

    def __init__(self) -> None:
        """Bind the factory to the EarthMindAuthorizationService implementation."""
        from earthmind.services.authorization.service import EarthMindAuthorizationService

        super().__init__(EarthMindAuthorizationService)

    def create(self, settings_service: SettingsService) -> BaseAuthorizationService:
        """Build a EarthMindAuthorizationService using the injected settings service."""
        return self.service_class(settings_service)
