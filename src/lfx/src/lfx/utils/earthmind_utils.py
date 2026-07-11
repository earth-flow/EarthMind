"""EarthMind environment utility functions."""

import importlib.util

from lfx.log.logger import logger


class _EarthMindModule:
    # Static variable
    # Tri-state:
    # - None: EarthMind check not performed yet
    # - True: EarthMind is available
    # - False: EarthMind is not available
    _available = None

    @classmethod
    def is_available(cls):
        return cls._available

    @classmethod
    def set_available(cls, value):
        cls._available = value


def has_earthmind_memory():
    """Check if earthmind.memory (with database support) and MessageTable are available."""
    # TODO: REVISIT: Optimize this implementation later
    # - Consider refactoring to use lazy loading or a more robust service discovery mechanism
    #   that can handle runtime availability changes.

    # Use cached check from previous invocation (if applicable)

    is_earthmind_available = _EarthMindModule.is_available()

    if is_earthmind_available is not None:
        return is_earthmind_available

    # First check (lazy load and cache check)

    module_spec = None

    try:
        module_spec = importlib.util.find_spec("earthmind")
    except ImportError:
        pass
    except (TypeError, ValueError) as e:
        logger.error(f"Error encountered checking for earthmind.memory: {e}")

    is_earthmind_available = module_spec is not None
    _EarthMindModule.set_available(is_earthmind_available)

    return is_earthmind_available


def has_earthmind_db_backend() -> bool:
    """Return True iff earthmind-backed memory calls have a real DB to hit.

    Requires both earthmind to be importable AND the registered database
    service to be a non-noop implementation. Evaluated on every call because
    the database service is typically registered *after* this module is first
    imported (e.g., from Component class definitions loaded before graph setup).
    """
    if not has_earthmind_memory():
        return False
    from lfx.services.database.service import NoopDatabaseService
    from lfx.services.deps import get_db_service

    try:
        return not isinstance(get_db_service(), NoopDatabaseService)
    except Exception:  # noqa: BLE001
        return False
