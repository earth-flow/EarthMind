"""Static model catalog for DeepSeek.

DeepSeek exposes an OpenAI-compatible API, so these models are instantiated
through ``ChatOpenAI`` with ``base_url`` pointed at the DeepSeek endpoint
(declared as ``base_url`` in ``MODEL_PROVIDER_METADATA``). DeepSeek publishes
no embedding endpoint, so there is deliberately no embeddings list here.
"""

from lfx.base.models.model_metadata import create_model_metadata

DEEPSEEK_MODELS_DETAILED = [
    # deepseek-chat is DeepSeek-V3; it supports function calling.
    create_model_metadata(
        provider="DeepSeek",
        name="deepseek-chat",
        icon="DeepSeek",
        tool_calling=True,
        default=True,
    ),
    # deepseek-reasoner is DeepSeek-R1. It emits chain-of-thought and does not
    # support function calling, so it is flagged as reasoning-only.
    create_model_metadata(
        provider="DeepSeek",
        name="deepseek-reasoner",
        icon="DeepSeek",
        reasoning=True,
    ),
]

DEEPSEEK_CHAT_MODEL_NAMES = [metadata["name"] for metadata in DEEPSEEK_MODELS_DETAILED]
