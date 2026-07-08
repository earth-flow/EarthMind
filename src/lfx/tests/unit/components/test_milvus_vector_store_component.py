"""Regression tests for Milvus vector store component compatibility."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from lfx.components.milvus.milvus import _build_compat_langchain_milvus_class


class _FakeLangchainMilvus:
    @property
    def client(self):
        return self._milvus_client


class TestMilvusVectorStoreComponentCompatibility:
    """Ensure cloud Milvus alias compatibility does not regress."""

    def test_col_registers_legacy_alias_before_collection_lookup(self, monkeypatch):
        compat_cls = _build_compat_langchain_milvus_class(_FakeLangchainMilvus)
        store = object.__new__(compat_cls)
        store.collection_name = 'docs'
        store.alias = 'cm-123'
        store.collection_properties = None
        store._cache_key = None
        store._col_cache = None
        store._connection_args = {
            'uri': 'https://example.zillizcloud.com:19538',
            'token': 'user:pass',
            'db_name': 'default',
        }
        store._milvus_client = SimpleNamespace(has_collection=lambda name: True)

        connect_calls = []
        collection_calls = []

        class _FakeConnections:
            def has_connection(self, alias):
                return False

            def connect(self, **kwargs):
                connect_calls.append(kwargs)

        class _FakeCollection:
            def __init__(self, name, using):
                collection_calls.append((name, using))

        monkeypatch.setattr('pymilvus.connections', _FakeConnections())
        monkeypatch.setattr('pymilvus.Collection', _FakeCollection)

        col = store.col

        assert col is not None
        assert connect_calls == [
            {
                'alias': 'cm-123',
                'uri': 'https://example.zillizcloud.com:19538',
                'token': 'user:pass',
                'db_name': 'default',
            }
        ]
        assert collection_calls == [('docs', 'cm-123')]
        assert store._cache_key == 'docs:cm-123'

    def test_col_skips_reconnect_when_alias_already_registered(self, monkeypatch):
        compat_cls = _build_compat_langchain_milvus_class(_FakeLangchainMilvus)
        store = object.__new__(compat_cls)
        store.collection_name = 'docs'
        store.alias = 'cm-456'
        store.collection_properties = None
        store._cache_key = None
        store._col_cache = None
        store._connection_args = {'uri': 'https://example.zillizcloud.com:19538', 'token': 'user:pass'}
        store._milvus_client = SimpleNamespace(has_collection=lambda name: True)

        fake_connections = MagicMock()
        fake_connections.has_connection.return_value = True
        fake_collection = MagicMock()

        monkeypatch.setattr('pymilvus.connections', fake_connections)
        monkeypatch.setattr('pymilvus.Collection', fake_collection)

        _ = store.col

        fake_connections.connect.assert_not_called()
        fake_collection.assert_called_once_with('docs', using='cm-456')
