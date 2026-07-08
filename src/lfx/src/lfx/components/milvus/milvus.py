from __future__ import annotations

from typing import Any

from lfx.base.vectorstores.model import LCVectorStoreComponent, check_cached_vector_store
from lfx.helpers.data import docs_to_data
from lfx.io import (
    BoolInput,
    DictInput,
    DropdownInput,
    FloatInput,
    HandleInput,
    IntInput,
    SecretStrInput,
    StrInput,
)
from lfx.schema.data import Data


def _build_compat_langchain_milvus_class(base_class: type) -> type:
    """Wrap langchain-milvus to restore the legacy alias connection when needed.

    `langchain-milvus` now creates a `MilvusClient`, but it still uses
    `pymilvus.Collection(using=alias)` in several paths. On some cloud
    deployments the collection can be created successfully via `MilvusClient`,
    while the later `Collection(...)` call fails because that legacy alias was
    never registered in `pymilvus.connections`.
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
        def col(self) -> Any | None:
            current_key = f"{self.collection_name}:{self.alias}"

            if self._cache_key == current_key and self._col_cache is not None:
                return self._col_cache

            if self.client.has_collection(self.collection_name):
                from pymilvus import Collection

                self._ensure_legacy_collection_connection()
                self._col_cache = Collection(self.collection_name, using=self.alias)
                if self.collection_properties is not None:
                    self._col_cache.set_properties(self.collection_properties)
                self._cache_key = current_key
                return self._col_cache

            self._col_cache = None
            self._cache_key = None
            return None

    CompatLangchainMilvus.__name__ = f"Compat{base_class.__name__}"
    CompatLangchainMilvus.__qualname__ = CompatLangchainMilvus.__name__
    return CompatLangchainMilvus


class MilvusVectorStoreComponent(LCVectorStoreComponent):
    """Milvus vector store with search capabilities."""

    display_name: str = "Milvus"
    description: str = "Milvus vector store with search capabilities"
    name = "Milvus"
    icon = "Milvus"

    inputs = [
        StrInput(name="collection_name", display_name="Collection Name", value="earthmind"),
        StrInput(name="collection_description", display_name="Collection Description", value=""),
        StrInput(
            name="uri",
            display_name="Connection URI",
            value="http://localhost:19530",
        ),
        SecretStrInput(
            name="password",
            display_name="Milvus Token",
            value="",
            info="Ignore this field if no token is required to make connection.",
        ),
        DictInput(name="connection_args", display_name="Other Connection Arguments", advanced=True),
        StrInput(name="primary_field", display_name="Primary Field Name", value="pk"),
        StrInput(name="text_field", display_name="Text Field Name", value="text"),
        StrInput(name="vector_field", display_name="Vector Field Name", value="vector"),
        DropdownInput(
            name="consistency_level",
            display_name="Consistencey Level",
            options=["Bounded", "Session", "Strong", "Eventual"],
            value="Session",
            advanced=True,
        ),
        DictInput(name="index_params", display_name="Index Parameters", advanced=True),
        DictInput(name="search_params", display_name="Search Parameters", advanced=True),
        BoolInput(name="drop_old", display_name="Drop Old Collection", value=False, advanced=True),
        FloatInput(name="timeout", display_name="Timeout", advanced=True),
        *LCVectorStoreComponent.inputs,
        HandleInput(name="embedding", display_name="Embedding", input_types=["Embeddings"]),
        IntInput(
            name="number_of_results",
            display_name="Number of Results",
            info="Number of results to return.",
            value=4,
            advanced=True,
        ),
    ]

    @check_cached_vector_store
    def build_vector_store(self):
        try:
            from langchain_milvus.vectorstores import Milvus as LangchainMilvus
        except ImportError as e:
            msg = "Could not import Milvus integration package. Please install it with `pip install langchain-milvus`."
            raise ImportError(msg) from e
        CompatLangchainMilvus = _build_compat_langchain_milvus_class(LangchainMilvus)
        self.connection_args.update(uri=self.uri, token=self.password)
        milvus_store = CompatLangchainMilvus(
            embedding_function=self.embedding,
            collection_name=self.collection_name,
            collection_description=self.collection_description,
            connection_args=self.connection_args,
            consistency_level=self.consistency_level,
            index_params=self.index_params,
            search_params=self.search_params,
            drop_old=self.drop_old,
            auto_id=True,
            primary_field=self.primary_field,
            text_field=self.text_field,
            vector_field=self.vector_field,
            timeout=self.timeout,
        )

        # Convert DataFrame to Data if needed using parent's method
        self.ingest_data = self._prepare_ingest_data()

        documents = []
        for _input in self.ingest_data or []:
            if isinstance(_input, Data):
                documents.append(_input.to_lc_document())
            else:
                documents.append(_input)

        if documents:
            milvus_store.add_documents(documents)

        return milvus_store

    def search_documents(self) -> list[Data]:
        vector_store = self.build_vector_store()

        if self.search_query and isinstance(self.search_query, str) and self.search_query.strip():
            docs = vector_store.similarity_search(
                query=self.search_query,
                k=self.number_of_results,
            )

            data = docs_to_data(docs)
            self.status = data
            return data
        return []
