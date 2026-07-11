"""Tests for the dynamic ``earthmind.components.*`` -> ``lfx.components.*`` bridge.

Saved flows in the wild import their components via the legacy
``earthmind.components.<sub>.<leaf>`` paths (the integration test
``test_dynamic_import_integration.py`` documents this contract).  The
lfx extraction moved every component module into ``lfx.components.*``;
``earthmind/__init__.py`` installs a meta path finder that bridges the
two namespaces dynamically so saved flows keep loading without
modification.

This suite locks the contract:

    1. Generic prefix bridge: ``earthmind.components.<rest>`` resolves to
       ``lfx.components.<rest>`` for arbitrary subpackages and submodules,
       including new bundles extracted in the future.
    2. Renamed-package override: ``earthmind.components.knowledge_bases``
       (and any submodule under it) resolves to
       ``lfx.components.files_and_knowledge`` because the package was
       renamed during the move while the earthmind-side path stays for
       saved-flow compat.
    3. Class identity is preserved: a class loaded via the earthmind path
       is the same object as the one loaded via the lfx path, so
       ``isinstance`` checks across the bridge keep working.
"""

from __future__ import annotations

import importlib
import sys

import earthmind  # noqa: F401  -- triggers the meta finder install


def test_dotted_submodule_import_resolves() -> None:
    """``from earthmind.components.processing.converter import X`` works.

    Regression: the deletion of the physical ``earthmind/components/processing/converter.py``
    shim broke this import path before the dynamic bridge landed.
    """
    from earthmind.components.processing.converter import convert_to_dataframe

    # The bridge is a name alias, not a copy; ``__module__`` reflects the
    # underlying lfx location so debuggers / stack traces point at the
    # canonical source file.
    assert convert_to_dataframe.__module__ == "lfx.components.processing.converter"


def test_helpers_subpackage_imports() -> None:
    """``from earthmind.components.helpers import X`` works for any helper class."""
    from earthmind.components.helpers import CalculatorComponent

    assert CalculatorComponent.__module__.startswith("lfx.components.")


def test_knowledge_bases_override_resolves_to_files_and_knowledge() -> None:
    """``earthmind.components.knowledge_bases[.<rest>]`` -> ``lfx.components.files_and_knowledge[.<rest>]``.

    The lfx package was renamed during the move; the earthmind-side path
    stays as ``knowledge_bases`` so saved flows that imported via that
    name continue to resolve.
    """
    from earthmind.components.knowledge_bases.retrieval import KnowledgeBaseComponent

    assert KnowledgeBaseComponent.__module__ == "lfx.components.files_and_knowledge.retrieval"


def test_class_identity_preserved_across_bridge() -> None:
    """Same class is returned via ``earthmind.components.X`` and ``lfx.components.X``.

    Critical for ``isinstance`` checks against types resolved through
    either path -- e.g. a saved flow imports the legacy earthmind path
    while runtime code imports the lfx path; both must compare equal.
    """
    import earthmind.components.processing.converter as earthmind_module
    import lfx.components.processing.converter as lfx_module

    assert earthmind_module is lfx_module
    assert earthmind_module.convert_to_dataframe is lfx_module.convert_to_dataframe


def test_top_level_components_is_aliased_to_lfx_components() -> None:
    """``import earthmind.components`` resolves to the lfx package.

    Catches the case where the meta finder isn't installed yet when
    ``earthmind.components`` is first imported -- happens on cold imports
    in test runs that don't go through ``earthmind.__init__`` first.
    """
    import earthmind.components
    import lfx.components

    assert earthmind.components is lfx.components


def test_arbitrary_extracted_bundle_resolves_via_dynamic_bridge() -> None:
    """A bundle that exists in lfx but had no physical ``earthmind/components`` shim resolves.

    Regression-future: the previous shim layout required a parallel
    physical file per subpackage; forgetting to add one silently broke
    pre-existing flows.  The dynamic bridge means a new lfx component
    module is reachable via the legacy earthmind path immediately.
    """
    # Pick any subpackage under lfx.components that didn't have a
    # physical shim under earthmind/components/ before the deletion.
    target = "lfx.components.helpers.calculator_core"
    importlib.import_module(target)
    bridge = importlib.import_module("earthmind.components.helpers.calculator_core")
    assert bridge is sys.modules[target]
