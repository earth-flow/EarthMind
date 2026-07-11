"""Exceptions raised by the EarthMind SDK."""

from __future__ import annotations


class EarthMindError(Exception):
    """Base class for all EarthMind SDK errors."""


class EarthMindHTTPError(EarthMindError):
    """An HTTP error was returned by the EarthMind API."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"HTTP {status_code}: {detail}")


class EarthMindNotFoundError(EarthMindHTTPError):
    """The requested resource was not found (404)."""


class EarthMindAuthError(EarthMindHTTPError):
    """Authentication failed (401/403)."""


class EarthMindValidationError(EarthMindHTTPError):
    """The request payload was rejected by the server (422)."""


class EarthMindConnectionError(EarthMindError):
    """Could not connect to the EarthMind instance."""


class EarthMindTimeoutError(EarthMindError):
    """A background job or polling operation exceeded its timeout.

    Adapted from ``EarthMindV2TimeoutError`` in earthmind-ai/sdk PR #1
    (Janardan Singh Kavia, IBM Corp., Apache 2.0).
    """


class EnvironmentNotFoundError(EarthMindError):
    """The named environment is not defined in the environments config."""

    def __init__(self, name: str) -> None:
        self.name = name
        super().__init__(
            f"Environment {name!r} not found. Check your earthmind-environments.toml (or EARTHMIND_ENV variable)."
        )


class EnvironmentConfigError(EarthMindError):
    """The environments config file is malformed or missing required fields."""
