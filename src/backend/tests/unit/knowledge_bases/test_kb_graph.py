from pathlib import Path


from earthmind.api.utils.kb_graph import (
    KB_GRAPH_MAX_NODES,
    KB_GRAPH_PERSISTED_CACHE_VERSION,
    _extract_chunk_triples,
    build_chunk_identifier,
    build_graph_cache_fingerprint,
    build_graph_cache_signature,
    build_knowledge_graph_response,
    load_persisted_graph_cache,
    persist_graph_cache,
    select_knowledge_graph_sample_entries,
)


def test_build_chunk_identifier_falls_back_to_stable_hash():
    metadata = {
        "file_name": "report.md",
        "chunk_index": 3,
        "section_path": "Intro > Summary",
    }
    first = build_chunk_identifier(metadata, "same content")
    second = build_chunk_identifier(metadata, "same content")

    assert first
    assert first == second


def test_build_knowledge_graph_response_extracts_entity_relations():
    entries = [
        (
            "chunk-1",
            "OpenAI uses GPT-4. GPT-4 supports LangChain.",
            {"file_name": "english.md"},
        ),
        (
            "chunk-2",
            "知识图谱使用实体关系模型。",
            {"file_name": "chinese.md"},
        ),
    ]

    response = build_knowledge_graph_response(
        entries,
        matched_chunks=2,
        total_files=2,
        truncated=False,
    )

    assert response.total_files == 2
    assert response.total_entities >= 4
    assert response.total_relations >= 2
    assert any(node.label == "OpenAI" for node in response.nodes)
    assert any(node.label == "GPT-4" for node in response.nodes)


def test_persisted_full_graph_cache_round_trips(tmp_path: Path):
    entries = [
        ("chunk-1", "OpenAI uses GPT-4.", {"file_name": "english.md"}),
    ]
    response = build_knowledge_graph_response(
        entries,
        matched_chunks=1,
        total_files=1,
        truncated=False,
    )
    signature = build_graph_cache_signature(
        full_graph=False,
        quality_mode="high",
        search="",
        source_type=None,
        file_name=None,
        job_id=None,
        metadata_filter_dict=None,
        chunk_ids=None,
        sample_limit=None,
        graph_mode="default",
        max_nodes=None,
        max_edges=None,
    )
    fingerprint = build_graph_cache_fingerprint(tmp_path)

    persist_graph_cache(
        tmp_path,
        signature=signature,
        fingerprint=fingerprint,
        response=response,
    )
    loaded = load_persisted_graph_cache(
        tmp_path,
        signature=signature,
        fingerprint=fingerprint,
    )

    assert loaded is not None
    assert loaded.total_files == 1
    assert loaded.total_entities >= 2
    assert loaded.total_relations >= 1


def test_graph_cache_signature_differs_by_full_graph_flag():
    trimmed_signature = build_graph_cache_signature(
        full_graph=False,
        quality_mode="high",
        search="topic",
        source_type="file_upload",
        file_name="doc.md",
        job_id="job-1",
        metadata_filter_dict={"team": ["alpha"]},
        chunk_ids=["chunk-1"],
        sample_limit=20,
        graph_mode="default",
        max_nodes=None,
        max_edges=None,
    )
    full_signature = build_graph_cache_signature(
        full_graph=True,
        quality_mode="high",
        search="topic",
        source_type="file_upload",
        file_name="doc.md",
        job_id="job-1",
        metadata_filter_dict={"team": ["alpha"]},
        chunk_ids=["chunk-1"],
        sample_limit=20,
        graph_mode="default",
        max_nodes=None,
        max_edges=None,
    )

    assert trimmed_signature != full_signature


def test_build_knowledge_graph_response_expands_multi_entity_relations():
    entries = [
        (
            "chunk-multi",
            "OpenAI and Anthropic use GPT-4 and Claude models.",
            {"file_name": "multi.md"},
        ),
    ]

    response = build_knowledge_graph_response(
        entries,
        matched_chunks=1,
        total_files=1,
        truncated=False,
    )

    assert response.total_entities >= 4
    assert response.total_relations >= 2


def test_build_knowledge_graph_response_trims_to_max_nodes():
    entries = [
        (
            f"chunk-{index}",
            f"Node{index:03d} uses Node{index + 1:03d}.",
            {"file_name": "large.md"},
        )
        for index in range(KB_GRAPH_MAX_NODES + 12)
    ]

    trimmed_response = build_knowledge_graph_response(
        entries,
        matched_chunks=len(entries),
        total_files=1,
        truncated=False,
    )

    assert len(trimmed_response.nodes) <= KB_GRAPH_MAX_NODES


def test_select_knowledge_graph_sample_entries_skips_empty_preview_chunks():
    entries = [
        ("chunk-empty-1", "目录", {"file_name": "preview.md"}),
        ("chunk-empty-2", "摘要", {"file_name": "preview.md"}),
        ("chunk-graph", "OpenAI uses GPT-4.", {"file_name": "preview.md"}),
    ]

    selected = select_knowledge_graph_sample_entries(
        entries,
        sample_limit=1,
    )

    assert [entry[0] for entry in selected] == ["chunk-graph"]
    response = build_knowledge_graph_response(
        selected,
        matched_chunks=len(entries),
        total_files=1,
        truncated=True,
    )
    assert response.total_entities >= 2
    assert response.total_relations >= 1


def test_select_knowledge_graph_sample_entries_balances_across_files():
    entries = [
        (
            "chunk-a1",
            "Remote sensing thermal infrared sensor calibration uses radiance transfer and emissivity retrieval.",
            {"file_name": "file-a.md"},
        ),
        (
            "chunk-a2",
            "Thermal infrared remote sensing supports land surface temperature inversion and atmospheric correction.",
            {"file_name": "file-a.md"},
        ),
        (
            "chunk-b1",
            "Hyperspectral imaging improves crop monitoring and mineral mapping.",
            {"file_name": "file-b.md"},
        ),
        (
            "chunk-c1",
            "SAR data helps flood detection and terrain deformation analysis.",
            {"file_name": "file-c.md"},
        ),
    ]

    selected = select_knowledge_graph_sample_entries(
        entries,
        sample_limit=3,
    )

    selected_files = {entry[2]["file_name"] for entry in selected}
    assert len(selected) == 3
    assert selected_files == {"file-a.md", "file-b.md", "file-c.md"}


def test_build_knowledge_graph_response_adds_document_context_nodes():
    entries = [
        (
            "chunk-a1",
            "Remote sensing uses hyperspectral imaging and SAR for terrain analysis.",
            {"file_name": "file-a.md"},
        ),
        (
            "chunk-b1",
            "SAR supports flood detection while hyperspectral imaging improves crop mapping.",
            {"file_name": "file-b.md"},
        ),
    ]

    response = build_knowledge_graph_response(
        entries,
        matched_chunks=2,
        total_files=2,
        truncated=False,
    )

    assert any(node.type == "document" for node in response.nodes)
    assert any(edge.label == "focuses on" for edge in response.edges)
    assert any(edge.label == "shared themes" for edge in response.edges)


def test_extract_chunk_triples_returns_triples():
    triples = _extract_chunk_triples(
        "OpenAI uses GPT-4 for language tasks.",
    )
    assert triples
    assert any(t.source == "OpenAI" or t.target == "OpenAI" for t in triples)


def test_extract_chunk_triples_handles_chinese():
    triples = _extract_chunk_triples(
        "知识图谱使用实体关系模型。",
    )
    assert triples
    # Should extract at least one relation
    assert any(t.relation for t in triples)


def test_entity_labels_are_truncated():
    """Entity labels should not exceed 24 characters."""
    long_text = "ThisIsAVeryLongEntityNameThatExceedsTwentyFourCharacters uses ShortName."
    entries = [("chunk-1", long_text, {"file_name": "test.md"})]
    response = build_knowledge_graph_response(
        entries,
        matched_chunks=1,
        total_files=1,
        truncated=False,
    )
    for node in response.nodes:
        assert len(node.label) <= 27  # 24 chars + "..." suffix


def test_persisted_cache_version_is_current():
    assert KB_GRAPH_PERSISTED_CACHE_VERSION == 18
