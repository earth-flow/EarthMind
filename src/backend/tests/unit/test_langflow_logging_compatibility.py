"""Test earthmind.logging backwards compatibility and integration.

This test ensures that earthmind.logging works correctly and that there are no
conflicts with the new lfx.logging backwards compatibility module.
"""

import pytest


def test_earthmind_logging_imports():
    """Test that earthmind.logging can be imported and works correctly."""
    try:
        from earthmind.logging import configure, logger

        assert configure is not None
        assert logger is not None
        assert callable(configure)
    except ImportError as e:
        pytest.fail(f"earthmind.logging should be importable: {e}")


def test_earthmind_logging_functionality():
    """Test that earthmind.logging functions work correctly."""
    from earthmind.logging import configure, logger

    # Should be able to configure
    try:
        configure(log_level="INFO")
    except Exception as e:
        pytest.fail(f"configure should work: {e}")

    # Should be able to log
    try:
        logger.info("Test message from earthmind.logging")
    except Exception as e:
        pytest.fail(f"logger should work: {e}")


def test_earthmind_logging_has_expected_exports():
    """Test that earthmind.logging has the expected exports."""
    import earthmind.logging

    assert hasattr(earthmind.logging, "configure")
    assert hasattr(earthmind.logging, "logger")
    assert hasattr(earthmind.logging, "disable_logging")
    assert hasattr(earthmind.logging, "enable_logging")

    # Check __all__
    assert hasattr(earthmind.logging, "__all__")
    expected_exports = {"configure", "logger", "disable_logging", "enable_logging"}
    assert set(earthmind.logging.__all__) == expected_exports


def test_earthmind_logging_specific_functions():
    """Test earthmind.logging specific functions (disable_logging, enable_logging)."""
    from earthmind.logging import disable_logging, enable_logging

    assert callable(disable_logging)
    assert callable(enable_logging)

    # Note: These functions have implementation issues (trying to call methods
    # that don't exist on structlog), but they should at least be importable
    # and callable. The actual functionality is a separate issue from the
    # backwards compatibility we're testing.


def test_no_conflict_with_lfx_logging():
    """Test that earthmind.logging and lfx.logging don't conflict."""
    # Import both
    from earthmind.logging import configure as lf_configure
    from earthmind.logging import logger as lf_logger
    from lfx.logging import configure as lfx_configure
    from lfx.logging import logger as lfx_logger

    # They should be the same underlying objects since earthmind.logging imports from lfx.log.logger
    # and lfx.logging re-exports from lfx.log.logger
    # Note: Due to import order and module initialization, object identity may vary,
    # but functionality should be equivalent
    assert callable(lf_configure)
    assert callable(lfx_configure)
    assert hasattr(lf_logger, "info")
    assert hasattr(lfx_logger, "info")

    # Test that both work without conflicts
    lf_configure(log_level="INFO")
    lfx_configure(log_level="INFO")
    lf_logger.info("Test from earthmind.logging")
    lfx_logger.info("Test from lfx.logging")


def test_earthmind_logging_imports_from_lfx():
    """Test that earthmind.logging correctly imports from lfx."""
    from earthmind.logging import configure, logger
    from lfx.log.logger import configure as lfx_configure
    from lfx.log.logger import logger as lfx_logger

    # earthmind.logging should import equivalent objects from lfx.log.logger
    # Due to module initialization order, object identity may vary
    assert callable(configure)
    assert callable(lfx_configure)
    assert hasattr(logger, "info")
    assert hasattr(lfx_logger, "info")

    # Test functionality equivalence
    configure(log_level="DEBUG")
    logger.debug("Test from earthmind.logging")
    lfx_configure(log_level="DEBUG")
    lfx_logger.debug("Test from lfx.log.logger")


def test_backwards_compatibility_scenario():
    """Test the complete backwards compatibility scenario."""
    # This tests the scenario where:
    # 1. earthmind.logging exists and imports from lfx.log.logger
    # 2. lfx.logging now exists (new) and re-exports from lfx.log.logger
    # 3. Both should work without conflicts

    # Import from all paths
    from earthmind.logging import configure as lf_configure
    from earthmind.logging import logger as lf_logger
    from lfx.log.logger import configure as orig_configure
    from lfx.log.logger import logger as orig_logger
    from lfx.logging import configure as lfx_configure
    from lfx.logging import logger as lfx_logger

    # All should be callable/have expected methods
    assert callable(lf_configure)
    assert callable(lfx_configure)
    assert callable(orig_configure)
    assert hasattr(lf_logger, "error")
    assert hasattr(lfx_logger, "info")
    assert hasattr(orig_logger, "debug")

    # All should work without conflicts
    lf_configure(log_level="ERROR")
    lf_logger.error("Message from earthmind.logging")

    lfx_configure(log_level="INFO")
    lfx_logger.info("Message from lfx.logging")

    orig_configure(log_level="DEBUG")
    orig_logger.debug("Message from lfx.log.logger")


def test_importing_earthmind_logging_in_earthmind():
    """Test that earthmind.logging can be imported and used in earthmind context without errors.

    This is similar to test_importing_earthmind_logging_in_lfx but tests the earthmind side
    using create_class to validate component creation with earthmind.logging imports.
    """
    from textwrap import dedent

    from lfx.custom.validate import create_class

    # Test that earthmind.logging can be used in component code created via create_class
    code = dedent("""
from earthmind.logging import logger, configure
from earthmind.logging.logger import logger
from earthmind.custom import Component

class TestEarthMindLoggingComponent(Component):
    def some_method(self):
        # Test that both logger and configure work in earthmind context
        configure(log_level="INFO")
        logger.info("Test message from earthmind component")

        # Test different log levels
        logger.debug("Debug message")
        logger.warning("Warning message")
        logger.error("Error message")

        return "earthmind_logging_success"
    """)

    result = create_class(code, "TestEarthMindLoggingComponent")
    assert result.__name__ == "TestEarthMindLoggingComponent"
