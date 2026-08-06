"""Custom exception types for Terraflow integration."""


class TerraflowIntegrationError(Exception):
    """Base exception for Terraflow integration errors."""

    pass


class ConversionError(TerraflowIntegrationError):
    """Error during Terraflow to Stepflow conversion."""

    pass


class ValidationError(TerraflowIntegrationError):
    """Error during workflow validation."""

    pass


class ExecutionError(TerraflowIntegrationError):
    """Error during component execution."""

    pass
