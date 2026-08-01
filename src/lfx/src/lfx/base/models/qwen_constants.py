"""Static model catalog for Qwen (Alibaba Cloud DashScope).

DashScope offers an OpenAI-compatible endpoint, so these models are
instantiated through ``ChatOpenAI`` / ``OpenAIEmbeddings`` with ``base_url``
pointed at the compatible-mode endpoint (declared as ``base_url`` in
``MODEL_PROVIDER_METADATA``).

Note the two regional endpoints — the Beijing default and the Singapore
``dashscope-intl`` host — accept different API keys. Users outside mainland
China generally need to override the base URL; that is why the API Base is
surfaced as a configurable provider variable rather than hardcoded.
"""

from lfx.base.models.model_metadata import create_model_metadata

QWEN_MODELS_DETAILED = [
    create_model_metadata(
        provider="Qwen",
        name="qwen-plus",
        icon="OpenAI",
        tool_calling=True,
        default=True,
    ),
    create_model_metadata(provider="Qwen", name="qwen-max", icon="OpenAI", tool_calling=True),
    create_model_metadata(provider="Qwen", name="qwen-turbo", icon="OpenAI", tool_calling=True),
    # Long-context variant (up to ~10M tokens); same wire format.
    create_model_metadata(provider="Qwen", name="qwen-long", icon="OpenAI", tool_calling=True),
]

QWEN_EMBEDDING_MODELS_DETAILED = [
    create_model_metadata(
        provider="Qwen",
        name="text-embedding-v4",
        icon="OpenAI",
        model_type="embeddings",
        default=True,
    ),
    create_model_metadata(
        provider="Qwen",
        name="text-embedding-v3",
        icon="OpenAI",
        model_type="embeddings",
    ),
]

QWEN_CHAT_MODEL_NAMES = [metadata["name"] for metadata in QWEN_MODELS_DETAILED]
QWEN_EMBEDDING_MODEL_NAMES = [metadata["name"] for metadata in QWEN_EMBEDDING_MODELS_DETAILED]
