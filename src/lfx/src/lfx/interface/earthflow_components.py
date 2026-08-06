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

# Every category name apply_earthflow_component_policy/refresh_terrabox_components_cache
# has generated from Terrabox tools so far. Terrabox toolkit categories are
# just the toolkit's bare slug (see earthflow_terrabox.terrabox_toolkit_category),
# indistinguishable by name alone from a stock Langflow category, so a refresh
# needs this to tell "this toolkit's tools just went to zero" apart from "this
# is an unrelated native category that happens to be empty" when deciding what
# to drop from the cache.
_terrabox_categories_seen: set[str] = set()


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
    by_category = build_terrabox_components_by_category(tool_specs)
    for category, components in by_category.items():
        result.setdefault(category, {}).update(components)
    _terrabox_categories_seen.clear()
    _terrabox_categories_seen.update(by_category)

    if earthflow_native_tools:
        result.setdefault(EARTHFLOW_ASSISTANT_TOOLS_CATEGORY, {}).update(earthflow_native_tools)

    return result


def refresh_terrabox_components_cache(
    *,
    terrabox_tools: list[TerraboxToolSpec] | None = None,
) -> int:
    """Re-fetch Terrabox's live tool catalog and push it into the running component cache.

    This is a targeted update, not a full cache rebuild or process restart.
    ``get_and_cache_all_types_dict`` only ever calls ``apply_earthflow_component_policy``
    once per process (the first time it's called after a fresh cache), so a
    toolkit or tool Terrabox adds after that point is otherwise invisible
    until restart even though ``load_terrabox_tool_specs`` itself already
    fetches live. This is what actually closes that gap: call it from a
    periodic background task or an on-demand refresh endpoint to make new
    Terrabox tools show up in the sidebar without restarting Terraflow.

    Mirrors :func:`lfx.interface.components.refresh_bundle_cache_from_record`'s
    direct-mutation approach, scoped to the ``earthflow_tools_*``/per-toolkit
    categories this module owns.

    Returns the number of Terrabox components now cached (0 if the base
    component cache hasn't been built yet -- nothing to refresh in that case,
    since the next ``get_and_cache_all_types_dict`` call builds it fresh with
    the current tool set anyway -- or if EarthFlow components are disabled).
    """
    from lfx.interface.components import component_cache

    if component_cache.all_types_dict is None or not earthflow_components_enabled():
        return 0

    tool_specs = terrabox_tools if terrabox_tools is not None else load_terrabox_tool_specs()
    by_category = build_terrabox_components_by_category(tool_specs)

    stale_categories = _terrabox_categories_seen - set(by_category)
    for category in stale_categories:
        component_cache.all_types_dict.pop(category, None)

    component_cache.all_types_dict.update(by_category)

    _terrabox_categories_seen.clear()
    _terrabox_categories_seen.update(by_category)

    # Invalidate the precomputed code-hash lookups, same as
    # refresh_bundle_cache_from_record -- the newly (re)generated Terrabox
    # component classes wouldn't otherwise be reflected in flow validation.
    component_cache.type_to_current_hash = None
    component_cache.all_known_hashes = None

    return sum(len(components) for components in by_category.values())
