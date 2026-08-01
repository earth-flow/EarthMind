"""Unit tests for the DeepSeek and Qwen unified model providers.

Both speak the OpenAI wire format and are instantiated through ``ChatOpenAI``
with a provider-specific ``base_url``. Covers:
  - Provider metadata registration and variable shape.
  - Static catalog wiring (chat models; Qwen embeddings, DeepSeek none).
  - get_llm base_url resolution: declared default vs. user override.
  - Embedding class/param mapping for Qwen.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

DEEPSEEK_DEFAULT_BASE = "https://api.deepseek.com"
QWEN_DEFAULT_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_INTL_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("provider", "key_var", "base_var", "default_base"),
    [
        ("DeepSeek", "DEEPSEEK_API_KEY", "DEEPSEEK_API_BASE", DEEPSEEK_DEFAULT_BASE),
        ("Qwen", "DASHSCOPE_API_KEY", "DASHSCOPE_API_BASE", QWEN_DEFAULT_BASE),
    ],
)
def test_provider_metadata_shape(provider, key_var, base_var, default_base):
    from lfx.base.models.model_metadata import MODEL_PROVIDER_METADATA

    meta = MODEL_PROVIDER_METADATA[provider]

    assert meta["mapping"]["model_class"] == "ChatOpenAI"
    assert meta["base_url"] == default_base

    variable_keys = [var["variable_key"] for var in meta["variables"]]
    assert variable_keys == [key_var, base_var]

    api_key_var = meta["variables"][0]
    assert api_key_var["is_secret"] is True
    assert api_key_var["langchain_param"] == "api_key"

    # The API base must stay optional — a declared default backs it.
    api_base_var = meta["variables"][1]
    assert api_base_var["required"] is False
    assert api_base_var["is_secret"] is False
    assert api_base_var["langchain_param"] == "base_url"


@pytest.mark.parametrize("provider", ["DeepSeek", "Qwen"])
def test_provider_selectable_in_language_model_component(provider):
    from lfx.base.models.model_input_constants import MODEL_PROVIDERS_LIST

    assert provider in MODEL_PROVIDERS_LIST


# ---------------------------------------------------------------------------
# Static catalog
# ---------------------------------------------------------------------------


def _catalog_rows(provider: str) -> list[dict]:
    from lfx.base.models.unified_models.provider_queries import get_models_detailed

    return [row for group in get_models_detailed() for row in group if row["provider"] == provider]


def test_deepseek_catalog_registered():
    rows = _catalog_rows("DeepSeek")
    names = {row["name"] for row in rows}

    assert {"deepseek-chat", "deepseek-reasoner"} <= names
    # DeepSeek publishes no embedding endpoint.
    assert all(row.get("model_type", "llm") == "llm" for row in rows)


def test_deepseek_reasoner_is_not_advertised_as_tool_calling():
    rows = {row["name"]: row for row in _catalog_rows("DeepSeek")}

    assert rows["deepseek-chat"].get("tool_calling") is True
    assert rows["deepseek-reasoner"].get("tool_calling", False) is False
    assert rows["deepseek-reasoner"].get("reasoning") is True


def test_qwen_catalog_has_chat_and_embedding_models():
    rows = _catalog_rows("Qwen")

    chat = {row["name"] for row in rows if row.get("model_type", "llm") == "llm"}
    embeddings = {row["name"] for row in rows if row.get("model_type") == "embeddings"}

    assert {"qwen-plus", "qwen-max", "qwen-turbo"} <= chat
    assert {"text-embedding-v3", "text-embedding-v4"} <= embeddings


def test_qwen_embeddings_use_openai_compatible_class():
    from lfx.base.models.unified_models.class_registry import (
        EMBEDDING_PARAM_MAPPINGS,
        EMBEDDING_PROVIDER_CLASS_MAPPING,
    )

    assert EMBEDDING_PROVIDER_CLASS_MAPPING["Qwen"] == "OpenAIEmbeddings"
    assert EMBEDDING_PARAM_MAPPINGS["Qwen"]["api_base"] == "base_url"
    # DeepSeek has no embedding endpoint and must not be resolvable as one.
    assert "DeepSeek" not in EMBEDDING_PROVIDER_CLASS_MAPPING


# ---------------------------------------------------------------------------
# get_llm — base URL resolution
# ---------------------------------------------------------------------------


def _model_selection(provider: str, name: str) -> list[dict]:
    return [
        {
            "name": name,
            "provider": provider,
            "metadata": {
                "model_class": "ChatOpenAI",
                "model_name_param": "model",
                "api_key_param": "api_key",  # pragma: allowlist secret
            },
        }
    ]


def _capture_llm_kwargs(provider: str, name: str, provider_vars: dict | None = None) -> dict:
    """Instantiate through get_llm with the model class stubbed out.

    ``langchain_openai`` is not installed in the isolated lfx test env, so the
    real ChatOpenAI cannot be constructed here; capture the kwargs instead.
    """
    from lfx.base.models import unified_models as unified_models_module
    from lfx.base.models.unified_models.instantiation import get_llm

    captured: dict = {}

    class FakeChatOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    with (
        patch.object(unified_models_module, "get_api_key_for_provider", return_value="dummy-key"),
        patch.object(unified_models_module, "get_model_class", return_value=FakeChatOpenAI),
        patch.object(
            unified_models_module,
            "get_all_variables_for_provider",
            return_value=provider_vars or {},
        ),
    ):
        get_llm(_model_selection(provider, name), user_id=None)

    return captured


@pytest.mark.parametrize(
    ("provider", "model_name", "default_base"),
    [
        ("DeepSeek", "deepseek-chat", DEEPSEEK_DEFAULT_BASE),
        ("Qwen", "qwen-plus", QWEN_DEFAULT_BASE),
    ],
)
def test_get_llm_applies_declared_default_base_url(provider, model_name, default_base):
    kwargs = _capture_llm_kwargs(provider, model_name)

    assert kwargs["model"] == model_name
    assert kwargs["base_url"] == default_base
    assert kwargs["stream_usage"] is True


@pytest.mark.parametrize(
    ("provider", "model_name", "base_var", "override"),
    [
        ("Qwen", "qwen-plus", "DASHSCOPE_API_BASE", QWEN_INTL_BASE),
        ("DeepSeek", "deepseek-chat", "DEEPSEEK_API_BASE", "https://proxy.internal/v1"),
    ],
)
def test_get_llm_configured_base_overrides_default(provider, model_name, base_var, override):
    """A configured API Base must beat the declared default.

    Regression guard: this path builds kwargs by hand rather than from
    ``langchain_param``, so the override has to be resolved explicitly. An
    earlier revision silently sent Singapore DashScope users to Beijing.
    """
    kwargs = _capture_llm_kwargs(provider, model_name, provider_vars={base_var: override})

    assert kwargs["base_url"] == override


def test_get_llm_env_base_overrides_default(monkeypatch):
    """With nothing in the database, the environment still overrides."""
    monkeypatch.setenv("DASHSCOPE_API_BASE", QWEN_INTL_BASE)

    kwargs = _capture_llm_kwargs("Qwen", "qwen-plus", provider_vars={})

    assert kwargs["base_url"] == QWEN_INTL_BASE


def test_get_llm_openrouter_base_url_unchanged():
    """OpenRouter shares the OpenAI-compatible branch — guard against regressions."""
    kwargs = _capture_llm_kwargs("OpenRouter", "anthropic/claude-3.5-sonnet")

    assert kwargs["base_url"] == "https://openrouter.ai/api/v1"


def test_get_llm_missing_api_key_names_the_right_variable(monkeypatch):
    from lfx.base.models.unified_models.instantiation import get_llm

    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)

    with pytest.raises(ValueError, match="DASHSCOPE_API_KEY") as exc_info:
        get_llm(_model_selection("Qwen", "qwen-plus"), user_id=None)

    assert "Qwen" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------


def _capture_embedding_kwargs(name: str, monkeypatch, base_override: str | None) -> dict:
    from lfx.base.models import unified_models as unified_models_module
    from lfx.base.models.unified_models.instantiation import get_embeddings

    if base_override is None:
        monkeypatch.delenv("DASHSCOPE_API_BASE", raising=False)
    else:
        monkeypatch.setenv("DASHSCOPE_API_BASE", base_override)

    captured: dict = {}

    class FakeOpenAIEmbeddings:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    with (
        patch.object(unified_models_module, "get_api_key_for_provider", return_value="dummy-key"),
        patch.object(unified_models_module, "get_embedding_class", return_value=FakeOpenAIEmbeddings),
    ):
        get_embeddings([{"provider": "Qwen", "name": name}], user_id=None)

    return captured


def test_get_embeddings_qwen_uses_default_base(monkeypatch):
    kwargs = _capture_embedding_kwargs("text-embedding-v4", monkeypatch, base_override=None)

    assert kwargs["model"] == "text-embedding-v4"
    assert kwargs["base_url"] == QWEN_DEFAULT_BASE


def test_get_embeddings_qwen_base_override(monkeypatch):
    kwargs = _capture_embedding_kwargs("text-embedding-v4", monkeypatch, base_override=QWEN_INTL_BASE)

    assert kwargs["base_url"] == QWEN_INTL_BASE


# ---------------------------------------------------------------------------
# Credential validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("provider", "key_var", "base_var"),
    [
        ("DeepSeek", "DEEPSEEK_API_KEY", "DEEPSEEK_API_BASE"),
        ("Qwen", "DASHSCOPE_API_KEY", "DASHSCOPE_API_BASE"),
    ],
)
def test_providers_registered_for_openai_compatible_validation(provider, key_var, base_var):
    from lfx.base.models.unified_models.credentials import OPENAI_COMPATIBLE_CREDENTIAL_VARS

    assert OPENAI_COMPATIBLE_CREDENTIAL_VARS[provider] == (key_var, base_var)
