"""Terraflow backwards compatibility layer.

This module provides backwards compatibility by forwarding imports from
terraflow.* to lfx.* to maintain compatibility with existing code that
references the old terraflow module structure.
"""

from terraflow.helpers.windows_postgres_helper import configure_windows_postgres_event_loop

configure_windows_postgres_event_loop(source="package_init")

import importlib  # noqa: E402
import importlib.abc  # noqa: E402
import importlib.machinery  # noqa: E402
import importlib.util  # noqa: E402
import sys  # noqa: E402
from types import ModuleType  # noqa: E402
from typing import Any  # noqa: E402

# ---------------------------------------------------------------------------
# Dynamic ``terraflow.components.*`` -> ``lfx.components.*`` bridge
# ---------------------------------------------------------------------------
#
# Saved flows in the wild import their components via ``terraflow.components.<sub>``
# (``from terraflow.components.processing.converter import convert_to_dataframe``,
# ``import terraflow.components.knowledge_bases.retrieval``, etc.).  The lfx
# extraction moved every component module into ``lfx.components.*``; we
# previously kept a stack of physical shim files (one per subpackage)
# under ``src/backend/base/terraflow/components/`` to forward those imports.
# Maintaining one shim file per subpackage does not scale -- every new lfx
# component requires a parallel terraflow shim, and forgetting to add one
# silently breaks pre-existing flows at load time.
#
# Replace the physical-shim stack with a single meta path finder that
# dynamically resolves any ``terraflow.components.<rest>`` import to the
# corresponding ``lfx.components.<rest>`` module.  The finder returns the
# already-loaded lfx module from ``create_module`` so the terraflow- and
# lfx-prefixed names share a single underlying module object; class
# identity is preserved across the bridge (critical for ``isinstance``
# checks against types resolved through either path).
#
# Special-case overrides cover the few subpackages whose name diverged
# during the move (e.g. ``knowledge_bases`` -> ``files_and_knowledge``).


class _TerraflowComponentsAliasLoader(importlib.abc.Loader):
    """Loader that fronts ``lfx.components.<rest>`` as ``terraflow.components.<rest>``.

    ``create_module`` returns the lfx module object directly so attribute
    access on either name resolves to the same backing module.
    ``exec_module`` is intentionally a no-op because the lfx module is
    already fully initialized by ``importlib.import_module`` inside
    ``create_module``.
    """

    def __init__(self, terraflow_name: str, lfx_name: str) -> None:
        self.terraflow_name = terraflow_name
        self.lfx_name = lfx_name

    def create_module(self, spec):  # noqa: ARG002 - protocol signature
        return importlib.import_module(self.lfx_name)

    def exec_module(self, module):  # noqa: ARG002 - module already initialised
        return None


class _TerraflowComponentsAliasFinder(importlib.abc.MetaPathFinder):
    """Bridge ``terraflow.components.<rest>`` -> ``lfx.components.<rest>`` for arbitrary subpackages.

    Replaces a stack of per-subpackage physical shim files with a single
    dynamic resolver, so a new lfx component module never requires a
    parallel terraflow shim.  Saved flows that imported components via
    the legacy ``terraflow.components.*`` paths (and the integration tests
    that document the contract) continue to load without modification.
    """

    _BRIDGE_PREFIX = "terraflow.components"
    _LFX_PREFIX = "lfx.components"

    # First-segment renames applied when translating ``terraflow.components.<head>[.<tail>]``
    # to ``lfx.components.<renamed>[.<tail>]``.  ``knowledge_bases`` was
    # renamed to ``files_and_knowledge`` in lfx during the move; the
    # terraflow-side import path stays as ``knowledge_bases`` so the
    # already-shipped saved flows continue to resolve.
    _PACKAGE_OVERRIDES = {
        "knowledge_bases": "files_and_knowledge",
    }

    def find_spec(self, fullname, path=None, target=None):  # noqa: ARG002 - protocol signature
        if fullname != self._BRIDGE_PREFIX and not fullname.startswith(self._BRIDGE_PREFIX + "."):
            return None
        rel = fullname[len(self._BRIDGE_PREFIX) :].lstrip(".")
        if rel:
            head, _, tail = rel.partition(".")
            head = self._PACKAGE_OVERRIDES.get(head, head)
            lfx_name = f"{self._LFX_PREFIX}.{head}" + (f".{tail}" if tail else "")
        else:
            lfx_name = self._LFX_PREFIX
        try:
            lfx_spec = importlib.util.find_spec(lfx_name)
        except (ImportError, ValueError, ModuleNotFoundError, AttributeError):
            return None
        if lfx_spec is None:
            return None
        # Mirror the lfx target's package-ness so ``__path__`` is set
        # correctly on the alias and downstream ``import`` statements that
        # treat the alias as a package keep working.
        is_package = lfx_spec.submodule_search_locations is not None
        return importlib.machinery.ModuleSpec(
            fullname,
            _TerraflowComponentsAliasLoader(fullname, lfx_name),
            is_package=is_package,
        )


class TerraflowCompatibilityModule(ModuleType):
    """A module that forwards attribute access to the corresponding lfx module."""

    def __init__(self, name: str, lfx_module_name: str):
        super().__init__(name)
        self._lfx_module_name = lfx_module_name
        self._lfx_module = None

    def _get_lfx_module(self):
        """Lazily import and cache the lfx module."""
        if self._lfx_module is None:
            try:
                self._lfx_module = importlib.import_module(self._lfx_module_name)
            except ImportError as e:
                msg = f"Cannot import {self._lfx_module_name} for backwards compatibility with {self.__name__}"
                raise ImportError(msg) from e
        return self._lfx_module

    def __getattr__(self, name: str) -> Any:
        """Forward attribute access to the lfx module with caching."""
        lfx_module = self._get_lfx_module()
        try:
            attr = getattr(lfx_module, name)
        except AttributeError as e:
            msg = f"module '{self.__name__}' has no attribute '{name}'"
            raise AttributeError(msg) from e
        else:
            # Cache the attribute in our __dict__ for faster subsequent access
            setattr(self, name, attr)
            return attr

    def __dir__(self):
        """Return directory of the lfx module."""
        try:
            lfx_module = self._get_lfx_module()
            return dir(lfx_module)
        except ImportError:
            return []


def _setup_compatibility_modules():
    """Set up comprehensive compatibility modules for terraflow.base imports."""
    # First, set up the base attribute on this module (terraflow)
    current_module = sys.modules[__name__]

    # Install the dynamic ``terraflow.components.<rest>`` -> ``lfx.components.<rest>``
    # bridge BEFORE any explicit module_mappings entries are registered.  The
    # finder handles every subpackage (including ones added later when a new
    # bundle is extracted), so the explicit per-helper entries that used to
    # live in module_mappings are no longer needed here.
    if not any(isinstance(f, _TerraflowComponentsAliasFinder) for f in sys.meta_path):
        sys.meta_path.insert(0, _TerraflowComponentsAliasFinder())

    # Define all the modules we need to support
    module_mappings = {
        # Core base module
        "terraflow.base": "lfx.base",
        # Inputs module - critical for class identity
        "terraflow.inputs": "lfx.inputs",
        "terraflow.inputs.inputs": "lfx.inputs.inputs",
        # Schema modules - also critical for class identity
        "terraflow.schema": "lfx.schema",
        "terraflow.schema.data": "lfx.schema.data",
        "terraflow.schema.serialize": "lfx.schema.serialize",
        # Template modules
        "terraflow.template": "lfx.template",
        "terraflow.template.field": "lfx.template.field",
        "terraflow.template.field.base": "lfx.template.field.base",
        # ``terraflow.components.*`` is bridged dynamically by
        # ``_TerraflowComponentsAliasFinder`` registered above, so no
        # entries are needed here.
        # Individual modules that exist in lfx
        "terraflow.base.agents": "lfx.base.agents",
        "terraflow.base.chains": "lfx.base.chains",
        "terraflow.base.data": "lfx.base.data",
        "terraflow.base.data.utils": "lfx.base.data.utils",
        "terraflow.base.document_transformers": "lfx.base.document_transformers",
        "terraflow.base.embeddings": "lfx.base.embeddings",
        "terraflow.base.flow_processing": "lfx.base.flow_processing",
        "terraflow.base.io": "lfx.base.io",
        "terraflow.base.io.chat": "lfx.base.io.chat",
        "terraflow.base.io.text": "lfx.base.io.text",
        "terraflow.base.langchain_utilities": "lfx.base.langchain_utilities",
        "terraflow.base.memory": "lfx.base.memory",
        "terraflow.base.models": "lfx.base.models",
        "terraflow.base.models.google_generative_ai_constants": "lfx.base.models.google_generative_ai_constants",
        "terraflow.base.models.openai_constants": "lfx.base.models.openai_constants",
        "terraflow.base.models.anthropic_constants": "lfx.base.models.anthropic_constants",
        "terraflow.base.models.aiml_constants": "lfx.base.models.aiml_constants",
        "terraflow.base.models.aws_constants": "lfx.base.models.aws_constants",
        "terraflow.base.models.groq_constants": "lfx.base.models.groq_constants",
        "terraflow.base.models.novita_constants": "lfx.base.models.novita_constants",
        "terraflow.base.models.ollama_constants": "lfx.base.models.ollama_constants",
        "terraflow.base.models.sambanova_constants": "lfx.base.models.sambanova_constants",
        "terraflow.base.models.cometapi_constants": "lfx.base.models.cometapi_constants",
        "terraflow.base.prompts": "lfx.base.prompts",
        "terraflow.base.prompts.api_utils": "lfx.base.prompts.api_utils",
        "terraflow.base.prompts.utils": "lfx.base.prompts.utils",
        "terraflow.base.textsplitters": "lfx.base.textsplitters",
        "terraflow.base.tools": "lfx.base.tools",
        "terraflow.base.vectorstores": "lfx.base.vectorstores",
    }

    # Create compatibility modules for each mapping
    for terraflow_name, lfx_name in module_mappings.items():
        if terraflow_name not in sys.modules:
            # Check if the lfx module exists
            try:
                spec = importlib.util.find_spec(lfx_name)
                if spec is not None:
                    # Create compatibility module
                    compat_module = TerraflowCompatibilityModule(terraflow_name, lfx_name)
                    sys.modules[terraflow_name] = compat_module

                    # Set up the module hierarchy
                    parts = terraflow_name.split(".")
                    if len(parts) > 1:
                        parent_name = ".".join(parts[:-1])
                        parent_module = sys.modules.get(parent_name)
                        if parent_module is not None:
                            setattr(parent_module, parts[-1], compat_module)

                    # Special handling for top-level modules
                    if terraflow_name == "terraflow.base":
                        current_module.base = compat_module
                    elif terraflow_name == "terraflow.inputs":
                        current_module.inputs = compat_module
                    elif terraflow_name == "terraflow.schema":
                        current_module.schema = compat_module
                    elif terraflow_name == "terraflow.template":
                        current_module.template = compat_module
                    elif terraflow_name == "terraflow.components":
                        current_module.components = compat_module
            except (ImportError, ValueError):
                # Skip modules that don't exist in lfx
                continue

    # Handle modules that exist only in terraflow (like knowledge_bases)
    # These need special handling because they're not in lfx yet.
    # ``terraflow.components.knowledge_bases`` is no longer listed here:
    # ``_TerraflowComponentsAliasFinder`` rewrites it to
    # ``lfx.components.files_and_knowledge`` via the override map and the
    # physical shim file used to live under ``components/knowledge_bases/``
    # has been removed.
    terraflow_only_modules = {
        "terraflow.base.data.kb_utils": "terraflow.base.data.kb_utils",
        "terraflow.base.knowledge_bases": "terraflow.base.knowledge_bases",
    }

    for terraflow_name in terraflow_only_modules:
        if terraflow_name not in sys.modules:
            try:
                # Try to find the actual physical module file
                from pathlib import Path

                base_dir = Path(__file__).parent

                if terraflow_name == "terraflow.base.data.kb_utils":
                    kb_utils_file = base_dir / "base" / "data" / "kb_utils.py"
                    if kb_utils_file.exists():
                        spec = importlib.util.spec_from_file_location(terraflow_name, kb_utils_file)
                        if spec is not None and spec.loader is not None:
                            module = importlib.util.module_from_spec(spec)
                            sys.modules[terraflow_name] = module
                            spec.loader.exec_module(module)

                            # Also add to parent module
                            parent_module = sys.modules.get("terraflow.base.data")
                            if parent_module is not None:
                                parent_module.kb_utils = module

                elif terraflow_name == "terraflow.base.knowledge_bases":
                    kb_dir = base_dir / "base" / "knowledge_bases"
                    kb_init_file = kb_dir / "__init__.py"
                    if kb_init_file.exists():
                        spec = importlib.util.spec_from_file_location(terraflow_name, kb_init_file)
                        if spec is not None and spec.loader is not None:
                            module = importlib.util.module_from_spec(spec)
                            sys.modules[terraflow_name] = module
                            spec.loader.exec_module(module)

                            # Also add to parent module
                            parent_module = sys.modules.get("terraflow.base")
                            if parent_module is not None:
                                parent_module.knowledge_bases = module

            except (ImportError, AttributeError):
                # If direct file loading fails, skip silently
                continue


# Set up all the compatibility modules
_setup_compatibility_modules()
