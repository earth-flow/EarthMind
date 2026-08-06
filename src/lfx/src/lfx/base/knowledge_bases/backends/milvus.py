"""Milvus / Zilliz Cloud vector-store backend.

Wraps ``langchain_milvus.vectorstores.Milvus`` so Terraflow Knowledge
Bases can target a self-hosted Milvus instance or a managed Zilliz Cloud
serverless cluster. The connection is established via a URI + token pair
(Zilliz Cloud serverless) or a plain URI (self-hosted Milvus without
auth).

``backend_config`` fields:

* ``uri_variable`` — name of the Terraflow variable holding the Milvus /
  Zilliz endpoint URI. Defaults to ``MILVUS_URI``. Required.
* ``token_variable`` — name of the variable holding the auth token
  (Zilliz Cloud token or Milvus username:password). Optional; defaults
  to the ``MILVUS_TOKEN`` variable name. Only the *variable name* lives
  in config — never the raw credential.
* ``collection_name`` — Milvus collection this KB writes / reads.
  Required.

The underlying ``langchain_milvus.Milvus`` store is configured with
``auto_id=True`` and ``enable_dynamic_field=True`` so arbitrary
``Document.metadata`` keys round-trip without a fixed schema — matching
the behaviour of the Chroma / OpenSearch backends.

Count, delete-by-metadata, and document iteration use the raw
``pymilvus.MilvusClient`` exposed by the LangChain wrapper (``store.client``)
since the LangChain surface for these operations is uneven across versions.
"""

from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import TYPE_CHECKING, Any

from lfx.base.knowledge_bases.backends.base import (
    BackendType,
    BaseVectorStoreBackend,
    IngestedDocument,
    TestConnectionResult,
)
from lfx.log.logger import logger

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from langchain_core.vectorstores import VectorStore


DEFAULT_URI_VARIABLE = "MILVUS_URI"
DEFAULT_TOKEN_VARIABLE = "MILVUS_TOKEN"  # noqa: S105 — variable name, not a secret  # pragma: allowlist secret

# Field names used by the LangChain Milvus wrapper. Kept in sync with
# ``langchain_milvus`` defaults so ``iter_documents`` reads back exactly
# what ingestion wrote.
DEFAULT_PRIMARY_FIELD = "pk"
DEFAULT_TEXT_FIELD = "text"
DEFAULT_VECTOR_FIELD = "vector"


def _build_compat_langchain_milvus_class(base_class: type) -> type:
    """Wrap langchain-milvus to restore the legacy alias connection.

    ``langchain-milvus`` creates a ``MilvusClient`` internally, but
    several code paths (e.g. ``Collection(using=alias)``) still rely on
    the legacy ``pymilvus.connections`` registry. On Zilliz Cloud
    serverless and some self-hosted deployments the collection can be
    created via ``MilvusClient`` while the later ``Collection(...)`` call
    fails because that alias was never registered.

    This shim mirrors the compatibility wrapper already used by the
    Milvus *component* (``lfx.components.milvus.milvus``) so KB
    ingestion and retrieval hit the same connection path.
    """

    class CompatLangchainMilvus(base_class):
        def _ensure_legacy_collection_connection(self) -> None:
            from pymilvus import connections

            if connections.has_connection(self.alias):
                return

            connection_args = dict(getattr(self, "_connection_args", {}) or {})
            for key in ("alias", "using", "dedicated", "_async"):
                connection_args.pop(key, None)

            connections.connect(alias=self.alias, **connection_args)

        @property
        def col(self) -> Any | None:  # noqa: A003 — matches langchain-milvus API
            current_key = f"{self.collection_name}:{self.alias}"

            if self._cache_key == current_key and self._col_cache is not None:  # noqa: SLF001
                return self._col_cache  # noqa: SLF001

            if self.client.has_collection(self.collection_name):
                from pymilvus import Collection

                self._ensure_legacy_collection_connection()  # noqa: SLF001
                self._col_cache = Collection(self.collection_name, using=self.alias)  # noqa: SLF001
                if self.collection_properties is not None:
                    self._col_cache.set_properties(self.collection_properties)  # noqa: SLF001
                self._cache_key = current_key  # noqa: SLF001
                return self._col_cache  # noqa: SLF001

            self._col_cache = None  # noqa: SLF001
            self._cache_key = None  # noqa: SLF001
            return None

    CompatLangchainMilvus.__name__ = f"Compat{base_class.__name__}"
    CompatLangchainMilvus.__qualname__ = CompatLangchainMilvus.__name__
    return CompatLangchainMilvus


class MilvusBackend(BaseVectorStoreBackend):
    """Milvus / Zilliz Cloud as a Terraflow KB backend."""

    backend_type = BackendType.MILVUS

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._resolved_uri: str | None = None
        self._resolved_token: str | None = None
        self._milvus_client_direct: Any | None = None

    # ---- credential resolution -------------------------------------------

    async def _resolve_secrets(self) -> None:
        """Resolve URI + optional token via the variable service.

        The URI is required. The token is optional for self-hosted
        Milvus clusters without authentication, but mandatory for
        Zilliz Cloud serverless.
        """
        raw_uri = self.backend_config.get("uri")
        if raw_uri:
            self._resolved_uri = str(raw_uri)
        else:
            uri_variable = self.backend_config.get("uri_variable") or DEFAULT_URI_VARIABLE
            uri = await self.resolve_secret(uri_variable)
            if not uri:
                msg = (
                    f"MilvusBackend needs either backend_config['uri'] or the {uri_variable!r} Terraflow variable "
                    "(or env var of the same name) populated with the Milvus / Zilliz endpoint URI."
                )
                raise ValueError(msg)
            self._resolved_uri = uri

        raw_token = self.backend_config.get("token")
        if raw_token:
            self._resolved_token = str(raw_token)
        else:
            token_variable = self.backend_config.get("token_variable") or DEFAULT_TOKEN_VARIABLE
            self._resolved_token = await self.resolve_secret(token_variable)

    def _required(self, key: str) -> str:
        value = self.backend_config.get(key)
        if not value:
            msg = f"MilvusBackend requires '{key}' in backend_config."
            raise ValueError(msg)
        return str(value)

    # ---- vector store ----------------------------------------------------

    def _build_vector_store(self) -> VectorStore:
        collection_name = self._required("collection_name")
        uri = getattr(self, "_resolved_uri", None)
        if not uri:
            msg = "MilvusBackend.ensure_ready() must be awaited before _build_vector_store."
            raise RuntimeError(msg)

        try:
            from langchain_milvus.vectorstores import Milvus as LangchainMilvus
        except ImportError as exc:
            msg = (
                "MilvusBackend requires langchain-milvus. "
                "Install it with `pip install langchain-milvus`."
            )
            raise RuntimeError(msg) from exc

        connection_args: dict[str, Any] = {"uri": uri}
        if self._resolved_token:
            connection_args["token"] = self._resolved_token

        compat_cls = _build_compat_langchain_milvus_class(LangchainMilvus)
        store = compat_cls(
            embedding_function=self.embedding_function,
            collection_name=collection_name,
            connection_args=connection_args,
            consistency_level="Session",
            auto_id=True,
            primary_field=DEFAULT_PRIMARY_FIELD,
            text_field=DEFAULT_TEXT_FIELD,
            vector_field=DEFAULT_VECTOR_FIELD,
            enable_dynamic_field=True,
            drop_old=False,
        )
        return store

    # ---- count -----------------------------------------------------------

    async def count(self) -> int:
        await self.ensure_ready()
        client = self._get_client()
        if client is None:
            return 0
        collection_name = self.backend_config.get("collection_name") or self.kb_name
        try:
            stats = await asyncio.to_thread(client.get_collection_stats, collection_name)
            return int(stats.get("row_count") or 0)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Milvus count() failed for %s: %s", self.kb_name, exc)
            return 0

    # ---- delete ----------------------------------------------------------

    async def delete_by(self, where: dict[str, Any]) -> None:
        """Delete documents by metadata filter.

        Uses a raw ``MilvusClient.delete`` path instead of LangChain's
        ``Milvus.adelete`` so rollback/cleanup can run even when no
        embedding_function is available (for example, failed ingestions and
        delete-on-cancel flows that should not need to build the vector store).
        """
        await self.ensure_ready()
        if not where:
            return
        client = self._get_client()
        collection_name = self.backend_config.get("collection_name") or self.kb_name
        ephemeral_client = False
        if client is None:
            try:
                from pymilvus import MilvusClient

                kwargs = {"uri": self._resolved_uri}
                if self._resolved_token:
                    kwargs["token"] = self._resolved_token
                client = await asyncio.to_thread(MilvusClient, **kwargs)
                ephemeral_client = True
            except Exception as exc:  # noqa: BLE001
                logger.warning("Milvus delete_by client init failed for %s: %s", self.kb_name, exc)
                return

        parts: list[str] = []
        for key, value in where.items():
            if isinstance(value, str):
                escaped = value.replace("'", "\'")
                parts.append(f"{key} == '{escaped}'")
            elif isinstance(value, bool):
                parts.append(f"{key} == {str(value).lower()}")
            elif value is None:
                parts.append(f"{key} is null")
            else:
                parts.append(f"{key} == {value}")
        expr = " and ".join(parts)
        try:
            await asyncio.to_thread(client.delete, collection_name=collection_name, filter=expr)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Milvus delete_by failed for %s: %s", self.kb_name, exc)
        finally:
            if ephemeral_client and client is not None:
                with suppress(Exception):
                    await asyncio.to_thread(client.close)
    # ---- iteration -------------------------------------------------------

    async def iter_documents(
        self,
        *,
        batch_size: int = 5000,
        include_embeddings: bool = False,
    ) -> AsyncIterator[list[IngestedDocument]]:
        """Stream documents via ``MilvusClient.query``.

        Milvus does not expose a stable scroll / cursor API on the
        ``MilvusClient`` surface that is safe to drive from an async
        context, so we paginate with offset-based ``query`` calls. This
        matches the pattern used by the Chroma backend.
        """
        await self.ensure_ready()
        client = self._get_client()
        if client is None:
            return

        collection_name = self.backend_config.get("collection_name") or self.kb_name

        # Build the output field list. We always request the text field
        # plus all dynamic metadata fields — but since
        # ``enable_dynamic_field=True`` flattens metadata into top-level
        # fields, requesting all fields (``output_fields=None``) returns
        # them inline. We then reconstruct ``metadata`` by stripping the
        # reserved structural fields.
        output_fields: list[str] | None = None
        if include_embeddings:
            output_fields = [DEFAULT_TEXT_FIELD, DEFAULT_VECTOR_FIELD]
        # ``None`` → all fields excluding the vector field by default in
        # pymilvus; we override to include the vector field explicitly
        # when the caller wants embeddings.

        reserved_fields = {
            DEFAULT_PRIMARY_FIELD,
            DEFAULT_TEXT_FIELD,
            DEFAULT_VECTOR_FIELD,
        }

        offset = 0
        while True:
            try:
                rows = await asyncio.to_thread(
                    client.query,
                    collection_name=collection_name,
                    filter="",
                    output_fields=output_fields,
                    limit=batch_size,
                    offset=offset,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Milvus query failed at offset %d for %s: %s", offset, self.kb_name, exc)
                return

            if not rows:
                return

            batch: list[IngestedDocument] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                content = row.pop(DEFAULT_TEXT_FIELD, "") or ""
                embedding = None
                if include_embeddings:
                    raw_vec = row.pop(DEFAULT_VECTOR_FIELD, None)
                    if raw_vec is not None:
                        try:
                            embedding = list(raw_vec)
                        except TypeError:
                            embedding = None
                else:
                    row.pop(DEFAULT_VECTOR_FIELD, None)
                # Remove the primary key from metadata — it's a structural
                # field, not user-supplied chunk metadata.
                row.pop(DEFAULT_PRIMARY_FIELD, None)
                metadata = {k: v for k, v in row.items() if k not in reserved_fields}
                batch.append(
                    IngestedDocument(
                        content=str(content),
                        metadata=metadata,
                        embedding=embedding,
                    )
                )
            if batch:
                yield batch

            if len(rows) < batch_size:
                return
            offset += batch_size

    # ---- storage size ----------------------------------------------------

    async def storage_size_bytes(self) -> int:
        await self.ensure_ready()
        client = self._get_client()
        if client is None:
            return 0
        collection_name = self.backend_config.get("collection_name") or self.kb_name
        try:
            stats = await asyncio.to_thread(client.get_collection_stats, collection_name)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Milvus get_collection_stats failed for %s: %s", self.kb_name, exc)
            return 0
        # ``get_collection_stats`` returns ``row_count`` but not byte size.
        # Hosted Milvus / Zilliz does not expose on-disk size via this API,
        # so we report 0 — consistent with the Chroma Cloud backend.
        try:
            return int(stats.get("row_count") or 0)
        except (TypeError, ValueError):
            return 0

    # ---- teardown / reset ------------------------------------------------

    async def teardown(self) -> None:
        """Release the Milvus client reference."""
        client = getattr(self.vector_store, "_milvus_client", None) if self._vector_store else None
        if client is not None and hasattr(client, "close"):
            try:
                await asyncio.to_thread(client.close)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Milvus client.close failed: %s", exc)
        if self._milvus_client_direct is not None and hasattr(self._milvus_client_direct, "close"):
            try:
                await asyncio.to_thread(self._milvus_client_direct.close)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Milvus direct client.close failed: %s", exc)
            finally:
                self._milvus_client_direct = None
        self._vector_store = None

    async def delete_collection(self) -> None:
        """Drop the configured collection. Used by KB deletion."""
        await self.ensure_ready()
        client = self._get_client()
        if client is None:
            return
        collection_name = self.backend_config.get("collection_name") or self.kb_name
        try:
            await asyncio.to_thread(client.drop_collection, collection_name)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Milvus drop_collection failed for %s: %s", self.kb_name, exc)

    # ---- test connection -------------------------------------------------

    async def test_connection(self) -> TestConnectionResult:
        """Validate credentials + reachability via ``get_server_version``.

        The LangChain Milvus store builds the client eagerly on
        construction (it dials the cluster), but issuing an explicit
        ``get_server_version`` on the raw ``MilvusClient`` exercises the
        same auth / TLS / DNS path ingestion uses and gives us a clean
        connectivity signal.
        """
        try:
            await self.ensure_ready()
        except ValueError as exc:
            return TestConnectionResult(
                ok=False,
                message=str(exc),
                details={"type": "ConfigError"},
            )
        except Exception as exc:  # noqa: BLE001
            return TestConnectionResult(
                ok=False,
                message=str(exc) or type(exc).__name__,
                details={"type": type(exc).__name__},
            )

        client = None
        try:
            from pymilvus import MilvusClient

            kwargs = {"uri": self._resolved_uri}
            if self._resolved_token:
                kwargs["token"] = self._resolved_token
            client = await asyncio.to_thread(MilvusClient, **kwargs)
            version = await asyncio.to_thread(client.get_server_version)
        except ImportError as exc:
            return TestConnectionResult(
                ok=False,
                message="pymilvus is not installed. Install the 'milvus' extras.",
                details={"type": type(exc).__name__},
            )
        except Exception as exc:  # noqa: BLE001
            return TestConnectionResult(
                ok=False,
                message=(
                    "Could not reach the Milvus / Zilliz cluster. Verify the URI, "
                    "token, and network access."
                ),
                details={"type": type(exc).__name__, "error": str(exc)},
            )
        finally:
            if client is not None:
                with suppress(Exception):
                    await asyncio.to_thread(client.close)

        return TestConnectionResult(
            ok=True,
            message="Connected to Milvus / Zilliz cluster successfully.",
            details={"version": str(version)},
        )

    # ---- helpers ---------------------------------------------------------

    def _get_client(self) -> Any | None:
        """Return a raw ``pymilvus.MilvusClient`` without requiring embeddings."""
        if self._vector_store is not None:
            client = getattr(self._vector_store, "_milvus_client", None)
            if client is not None:
                return client

        if self._milvus_client_direct is not None:
            return self._milvus_client_direct

        if not self._resolved_uri:
            return None

        try:
            from pymilvus import MilvusClient

            kwargs = {"uri": self._resolved_uri}
            if self._resolved_token:
                kwargs["token"] = self._resolved_token
            self._milvus_client_direct = MilvusClient(**kwargs)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Milvus direct client init failed for %s: %s", self.kb_name, exc)
            return None

        return self._milvus_client_direct
