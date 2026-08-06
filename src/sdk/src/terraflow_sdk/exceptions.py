"""Exceptions raised by the Terraflow SDK."""

from __future__ import annotations


class TerraflowError(Exception):
    """Base class for all Terraflow SDK errors."""


class TerraflowHTTPError(TerraflowError):
    """An HTTP error was returned by the Terraflow API."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"HTTP {status_code}: {detail}")


class TerraflowNotFoundError(TerraflowHTTPError):
    """The requested resource was not found (404)."""


class TerraflowAuthError(TerraflowHTTPError):
    """Authentication failed (401/403)."""


class TerraflowValidationError(TerraflowHTTPError):
    """The request payload was rejected by the server (422)."""


class TerraflowConnectionError(TerraflowError):
    """Could not connect to the Terraflow instance."""


class TerraflowTimeoutError(TerraflowError):
    """A background job or polling operation exceeded its timeout.

    Adapted from ``TerraflowV2TimeoutError`` in terraflow-ai/sdk PR #1
    (Janardan Singh Kavia, IBM Corp., Apache 2.0).
    """


class EnvironmentNotFoundError(TerraflowError):
    """The named environment is not defined in the environments config."""

    def __init__(self, name: str) -> None:
        self.name = name
        super().__init__(
            f"Environment {name!r} not found. Check your terraflow-environments.toml (or TERRAFLOW_ENV variable)."
        )


class EnvironmentConfigError(TerraflowError):
    """The environments config file is malformed or missing required fields."""
