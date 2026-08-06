"""Authorization service factory."""

from __future__ import annotations

from typing import TYPE_CHECKING

from terraflow.services.factory import ServiceFactory
from terraflow.services.schema import ServiceType

if TYPE_CHECKING:
    from lfx.services.authorization.base import BaseAuthorizationService
    from lfx.services.settings.service import SettingsService

    from terraflow.services.authorization.service import TerraflowAuthorizationService


class AuthorizationServiceFactory(ServiceFactory):
    """Factory that creates the Terraflow authorization service."""

    name = ServiceType.AUTHORIZATION_SERVICE.value

    service_class: type[TerraflowAuthorizationService]

    def __init__(self) -> None:
        """Bind the factory to the TerraflowAuthorizationService implementation."""
        from terraflow.services.authorization.service import TerraflowAuthorizationService

        super().__init__(TerraflowAuthorizationService)

    def create(self, settings_service: SettingsService) -> BaseAuthorizationService:
        """Build a TerraflowAuthorizationService using the injected settings service."""
        return self.service_class(settings_service)
