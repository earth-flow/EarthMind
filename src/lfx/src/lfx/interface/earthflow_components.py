from __future__ import annotations

import os
from typing import Any

from lfx.interface.earthflow_terrabox import (
    TerraboxToolSpec,
    build_terrabox_components_by_category,
    load_terrabox_tool_specs,
)

EARTHFLOW_COMPONENTS_ENABLED = "EARTHFLOW_COMPONENTS_ENABLED"

# The toolkit-level sidebar category for EarthFlow's native (non-generated)
# assistant tools -- kept separate from the per-Terrabox-toolkit categories
# built below so it reads as its own catalog entry. No "earthflow"/"tools"
# prefix, same reasoning as `terrabox_toolkit_category` -- the sidebar's
# auto-titled fallback label is just this string title-cased, so a short bare
# name ("Assistant Tools") beats a repeated, overly long one.
EARTHFLOW_ASSISTANT_TOOLS_CATEGORY = "assistant_tools"

# Native (non-generated) components that are EarthFlow-specific additions rather
# than stock Langflow components. They get pulled out of whatever category the
# component directory scan naturally assigns them to (e.g. "files_and_knowledge")
# and regrouped into EARTHFLOW_ASSISTANT_TOOLS_CATEGORY, so all EarthFlow-specific
# tools live in dedicated toolkit sections instead of being scattered among or
# hidden from the stock components.
_EARTHFLOW_NATIVE_TOOL_NAMES: frozenset[str] = frozenset({"WordDocumentTool", "CommandExecutionTool"})


def earthflow_components_enabled() -> bool:
    value = os.getenv(EARTHFLOW_COMPONENTS_ENABLED, "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _extract_earthflow_native_tools(all_types: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Pop EarthFlow-specific native components out of `all_types` in place.

    Returns the extracted {name: template} entries so the caller can merge them
    into the dedicated EarthFlow tools category.
    """
    extracted: dict[str, dict[str, Any]] = {}
    for components in all_types.values():
        for name in list(components):
            if name in _EARTHFLOW_NATIVE_TOOL_NAMES:
                extracted[name] = components.pop(name)
    return extracted


def apply_earthflow_component_policy(
    all_types: dict[str, dict[str, Any]],
    *,
    terrabox_tools: list[TerraboxToolSpec] | None = None,
) -> dict[str, dict[str, Any]]:
    if not earthflow_components_enabled():
        return all_types

    result = {category: dict(components) for category, components in all_types.items()}
    earthflow_native_tools = _extract_earthflow_native_tools(result)
    result = {category: components for category, components in result.items() if components}

    tool_specs = terrabox_tools if terrabox_tools is not None else load_terrabox_tool_specs()
    for category, components in build_terrabox_components_by_category(tool_specs).items():
        result.setdefault(category, {}).update(components)

    if earthflow_native_tools:
        result.setdefault(EARTHFLOW_ASSISTANT_TOOLS_CATEGORY, {}).update(earthflow_native_tools)

    return result
