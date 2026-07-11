"""pytest plugin providing fixtures for integration-testing EarthMind flows.

Install with the ``testing`` extra::

    pip install "earthmind-sdk[testing]"

The plugin is auto-discovered by pytest via the ``pytest11`` entry point, so
no ``conftest.py`` changes are needed.  Simply pass connection details on the
command line or via environment variables::

    # Direct URL
    pytest --earthmind-url http://localhost:7860 tests/

    # Named environment from earthmind-environments.toml
    pytest --earthmind-env staging tests/

    # Via environment variables (useful in CI)
    EARTHMIND_URL=http://localhost:7860 pytest tests/

Usage inside a test file::

    def test_my_rag_flow(flow_runner):
        response = flow_runner("rag-endpoint", "What is EarthMind?")
        assert "EarthMind" in response.first_text_output()

    async def test_my_async_flow(async_flow_runner):
        response = await async_flow_runner("rag-endpoint", "Hello")
        assert response.first_text_output() is not None
"""

from __future__ import annotations

import contextlib
import os
from typing import TYPE_CHECKING, Any

try:
    import pytest
except ImportError as exc:
    msg = "pytest is required for earthmind_sdk.testing. Install it with: pip install 'earthmind-sdk[testing]'"
    raise ImportError(msg) from exc

if TYPE_CHECKING:
    from uuid import UUID

    from earthmind_sdk.client import AsyncClient, Client
    from earthmind_sdk.models import RunResponse


# ---------------------------------------------------------------------------
# CLI options
# ---------------------------------------------------------------------------


def pytest_addoption(parser: pytest.Parser) -> None:
    """Register EarthMind-specific CLI options."""
    group = parser.getgroup("earthmind", "EarthMind integration testing options")
    options = {
        "--earthmind-env": {
            "dest": "earthmind_env",
            "default": None,
            "metavar": "NAME",
            "help": "Environment name from earthmind-environments.toml to use for integration tests.",
        },
        "--earthmind-url": {
            "dest": "earthmind_url",
            "default": None,
            "metavar": "URL",
            "help": "Base URL of the EarthMind instance (overrides --earthmind-env).",
        },
        "--earthmind-api-key": {
            "dest": "earthmind_api_key",
            "default": None,
            "metavar": "KEY",
            "help": "API key for the EarthMind instance (overrides environment config).",
        },
        "--earthmind-environments-file": {
            "dest": "earthmind_environments_file",
            "default": None,
            "metavar": "PATH",
            "help": "Path to earthmind-environments.toml (overrides default discovery).",
        },
    }

    # earthmind-sdk and lfx can both be installed in the same environment and
    # expose the same remote-testing flags. Keep registration idempotent so
    # pytest plugin auto-discovery can load both entry points safely.
    for flag, kwargs in options.items():
        with contextlib.suppress(ValueError):
            group.addoption(flag, **kwargs)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_url_credentials(request: pytest.FixtureRequest) -> tuple[str, str | None] | None:
    """Extract (url, api_key) from CLI options / env vars, or return None."""
    url: str | None = request.config.getoption("earthmind_url") or os.getenv("EARTHMIND_URL")
    if not url:
        return None
    # pragma: allowlist secret
    api_key: str | None = request.config.getoption("earthmind_api_key") or os.getenv("EARTHMIND_API_KEY")
    return url, api_key


def _resolve_url_client(request: pytest.FixtureRequest) -> Client | None:
    """Return a sync client from --earthmind-url / EARTHMIND_URL, or None."""
    from earthmind_sdk.client import Client

    creds = _resolve_url_credentials(request)
    return Client(base_url=creds[0], api_key=creds[1]) if creds else None


def _resolve_async_url_client(request: pytest.FixtureRequest) -> AsyncClient | None:
    """Return an async client from --earthmind-url / EARTHMIND_URL, or None."""
    from earthmind_sdk.client import AsyncClient

    creds = _resolve_url_credentials(request)
    return AsyncClient(base_url=creds[0], api_key=creds[1]) if creds else None


def _env_name(request: pytest.FixtureRequest) -> str | None:
    return request.config.getoption("earthmind_env") or os.getenv("EARTHMIND_ENV")


def _env_file(request: pytest.FixtureRequest) -> str | None:
    return request.config.getoption("earthmind_environments_file") or os.getenv("EARTHMIND_ENVIRONMENTS_FILE")


_SKIP_MSG = (
    "No EarthMind connection configured. Pass --earthmind-url <URL> or --earthmind-env <NAME> to enable integration tests."
)


# ---------------------------------------------------------------------------
# Session-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def earthmind_client(request: pytest.FixtureRequest) -> Client:
    """Session-scoped fixture that returns a configured :class:`~earthmind_sdk.Client`.

    The fixture skips the test session automatically when no connection
    information is available.  Configure via CLI options or environment
    variables (in priority order):

    1. ``--earthmind-url`` / ``EARTHMIND_URL`` — direct base URL
    2. ``--earthmind-api-key`` / ``EARTHMIND_API_KEY`` — API key  # pragma: allowlist secret
    3. ``--earthmind-env`` / ``EARTHMIND_ENV`` — named environment from TOML file
    4. ``--earthmind-environments-file`` / ``EARTHMIND_ENVIRONMENTS_FILE`` — TOML path
    """
    client = _resolve_url_client(request)
    if not client:
        env = _env_name(request)
        if env:
            from pathlib import Path

            from earthmind_sdk.environments import get_client

            env_file = _env_file(request)
            config_file = Path(env_file) if env_file else None
            client = get_client(env, config_file=config_file)
        else:
            pytest.skip(_SKIP_MSG)

    yield client
    client.close()


@pytest.fixture(scope="session")
async def async_earthmind_client(request: pytest.FixtureRequest) -> AsyncClient:
    """Session-scoped fixture returning a configured :class:`~earthmind_sdk.AsyncClient`.

    Same configuration resolution as :func:`earthmind_client`.
    """
    client = _resolve_async_url_client(request)
    if not client:
        env = _env_name(request)
        if env:
            from pathlib import Path

            from earthmind_sdk.environments import get_async_client

            env_file = _env_file(request)
            config_file = Path(env_file) if env_file else None
            client = get_async_client(env, config_file=config_file)
        else:
            pytest.skip(_SKIP_MSG)

    yield client
    await client.aclose()


# ---------------------------------------------------------------------------
# FlowRunner / AsyncFlowRunner callables
# ---------------------------------------------------------------------------


class FlowRunner:
    """Callable returned by the :func:`flow_runner` fixture.

    Call it like a function to execute a flow and receive a
    :class:`~earthmind_sdk.RunResponse`::

        def test_greeting(flow_runner):
            response = flow_runner("my-endpoint", "Hello!")
            assert response.first_text_output() is not None

    Keyword-only arguments mirror the fields of
    :class:`~earthmind_sdk.RunRequest`.
    """

    def __init__(self, client: Client) -> None:
        self._client = client

    def __call__(
        self,
        flow_id_or_endpoint: UUID | str,
        input_value: str = "",
        *,
        input_type: str = "chat",
        output_type: str = "chat",
        tweaks: dict[str, Any] | None = None,
        stream: bool = False,
    ) -> RunResponse:
        """Run *flow_id_or_endpoint* and return the full :class:`~earthmind_sdk.RunResponse`."""
        from earthmind_sdk.models import RunRequest

        return self._client.run_flow(
            flow_id_or_endpoint,
            RunRequest(
                input_value=input_value,
                input_type=input_type,
                output_type=output_type,
                tweaks=tweaks,
                stream=stream,
            ),
        )


class AsyncFlowRunner:
    """Async callable returned by the :func:`async_flow_runner` fixture.

    Use with ``await`` inside an ``async def`` test::

        async def test_greeting(async_flow_runner):
            response = await async_flow_runner("my-endpoint", "Hello!")
            assert response.first_text_output() is not None
    """

    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def __call__(
        self,
        flow_id_or_endpoint: UUID | str,
        input_value: str = "",
        *,
        input_type: str = "chat",
        output_type: str = "chat",
        tweaks: dict[str, Any] | None = None,
        stream: bool = False,
    ) -> RunResponse:
        """Run *flow_id_or_endpoint* asynchronously and return the full response."""
        from earthmind_sdk.models import RunRequest

        return await self._client.run_flow(
            flow_id_or_endpoint,
            RunRequest(
                input_value=input_value,
                input_type=input_type,
                output_type=output_type,
                tweaks=tweaks,
                stream=stream,
            ),
        )


# ---------------------------------------------------------------------------
# Function-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def flow_runner(earthmind_client: Client) -> FlowRunner:
    """Fixture that returns a :class:`FlowRunner` for running flows in tests.

    Depends on the session-scoped :func:`earthmind_client` fixture, so the
    test is automatically skipped when no connection is configured.

    Example::

        def test_rag_flow(flow_runner):
            response = flow_runner("rag-endpoint", "What is EarthMind?")
            assert "EarthMind" in response.first_text_output()
    """
    return FlowRunner(earthmind_client)


@pytest.fixture
def async_flow_runner(async_earthmind_client: AsyncClient) -> AsyncFlowRunner:
    """Fixture that returns an :class:`AsyncFlowRunner` for async tests.

    Example::

        async def test_rag_flow(async_flow_runner):
            response = await async_flow_runner("rag-endpoint", "What is EarthMind?")
            assert "EarthMind" in response.first_text_output()
    """
    return AsyncFlowRunner(async_earthmind_client)
