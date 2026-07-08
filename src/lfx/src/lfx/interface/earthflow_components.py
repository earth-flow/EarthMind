from __future__ import annotations

import os
from typing import Any

from lfx.interface.earthflow_terrabox import (
    EARTHFLOW_TOOLS_CATEGORY,
    TerraboxToolSpec,
    build_terrabox_components_dict,
    load_terrabox_tool_specs,
)

EARTHFLOW_COMPONENTS_ENABLED = "EARTHFLOW_COMPONENTS_ENABLED"

_KEEP_ALL_CATEGORIES: frozenset[str] = frozenset(
    {
        "deepseek",
        "bing",
        "exa",
        "firecrawl",
        "searchapi",
        "serpapi",
        "tavily",
        "wikipedia",
    }
)

_ALLOWLIST_BY_CATEGORY: dict[str, frozenset[str]] = {
    "input_output": frozenset({"ChatInput", "ChatOutput", "TextInput", "TextOutput", "Webhook"}),
    "models_and_agents": frozenset(
        {
            "Agent",
            "EmbeddingModel",
            "LanguageModelComponent",
            "MCPTools",
            "Memory",
            "Prompt Template",
        }
    ),
    "data_source": frozenset(
        {
            "APIRequest",
            "CSVtoData",
            "JSONtoData",
            "NewsSearch",
            "RSSReaderSimple",
            "URLComponent",
            "UnifiedWebSearch",
        }
    ),
    "flow_controls": frozenset(
        {
            "ConditionalRouter",
            "DataConditionalRouter",
            "FlowTool",
            "Listen",
            "LoopComponent",
            "Notify",
            "Pass",
            "RunFlow",
            "SubFlow",
        }
    ),
    "tools": frozenset(
        {
            "CalculatorTool",
            "GoogleSearchAPI",
            "GoogleSerperAPI",
            "SearXNGTool",
            "SearchAPI",
            "SerpAPI",
            "TavilyAISearch",
            "WikidataAPI",
            "WikipediaAPI",
        }
    ),
    "llm_operations": frozenset({"BatchRunComponent", "LLMSelectorComponent", "StructuredOutput"}),
    "processing": frozenset(
        {
            "CombineText",
            "CreateData",
            "CreateList",
            "DataOperations",
            "DataToDataFrame",
            "JSONCleaner",
            "MergeDataComponent",
            "MessagetoData",
            "OutputParser",
            "ParseData",
            "ParseJSONData",
            "ParserComponent",
            "SplitText",
            "TextOperations",
            "TypeConverterComponent",
        }
    ),
    "utilities": frozenset({"CalculatorComponent", "CurrentDate", "IDGenerator"}),
    "files_and_knowledge": frozenset({"Directory", "File", "FileSystemTool", "SaveToFile"}),
    "langchain_utilities": frozenset(
        {
            "CharacterTextSplitter",
            "LanguageRecursiveTextSplitter",
            "NaturalLanguageTextSplitter",
            "RecursiveCharacterTextSplitter",
            "SemanticTextSplitter",
        }
    ),
    "google": frozenset({"GoogleSearchAPICore", "GoogleSerperAPICore"}),
}


def earthflow_components_enabled() -> bool:
    value = os.getenv(EARTHFLOW_COMPONENTS_ENABLED, "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _filter_native_components(all_types: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    filtered: dict[str, dict[str, Any]] = {}
    for category, components in all_types.items():
        if category in _KEEP_ALL_CATEGORIES:
            if components:
                filtered[category] = dict(components)
            continue

        allowed = _ALLOWLIST_BY_CATEGORY.get(category)
        if allowed is None:
            continue

        category_components = {name: template for name, template in components.items() if name in allowed}
        if category_components:
            filtered[category] = category_components
    return filtered


def apply_earthflow_component_policy(
    all_types: dict[str, dict[str, Any]],
    *,
    terrabox_tools: list[TerraboxToolSpec] | None = None,
) -> dict[str, dict[str, Any]]:
    if not earthflow_components_enabled():
        return all_types

    filtered = _filter_native_components(all_types)
    tool_specs = terrabox_tools if terrabox_tools is not None else load_terrabox_tool_specs()
    terrabox_components = build_terrabox_components_dict(tool_specs)
    if terrabox_components:
        filtered[EARTHFLOW_TOOLS_CATEGORY] = terrabox_components
    return filtered
