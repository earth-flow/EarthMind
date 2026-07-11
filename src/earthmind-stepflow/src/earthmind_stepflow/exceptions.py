"""Custom exception types for EarthMind integration."""


class EarthMindIntegrationError(Exception):
    """Base exception for EarthMind integration errors."""

    pass


class ConversionError(EarthMindIntegrationError):
    """Error during EarthMind to Stepflow conversion."""

    pass


class ValidationError(EarthMindIntegrationError):
    """Error during workflow validation."""

    pass


class ExecutionError(EarthMindIntegrationError):
    """Error during component execution."""

    pass
