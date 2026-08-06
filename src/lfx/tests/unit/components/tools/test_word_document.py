"""Unit tests for WordDocumentToolComponent (sandboxed .docx agent tool)."""

from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING

import pytest
from lfx.components.files_and_knowledge.filesystem import FileSystemToolComponent
from lfx.components.files_and_knowledge.word_document import WordDocumentToolComponent

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture(autouse=True)
def _auto_login(monkeypatch: pytest.MonkeyPatch) -> None:
    # Patched at the CLASS level: WordDocumentToolComponent composes a fresh
    # FileSystemToolComponent instance per call (see _fs()), so an instance-level
    # patch on the outer component would not reach it.
    monkeypatch.setattr(FileSystemToolComponent, "_resolve_auto_login", lambda self: True)  # noqa: ARG005


@pytest.fixture
def sandbox(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("TERRAFLOW_FS_TOOL_BASE_DIR", str(tmp_path))
    shared = tmp_path / "shared"
    shared.mkdir(parents=True, exist_ok=True)
    (shared / "not_docx.txt").write_text("hello", encoding="utf-8")
    return shared


@pytest.fixture
def component(sandbox: Path) -> WordDocumentToolComponent:  # noqa: ARG001 — sandbox sets BASE_DIR via monkeypatch
    return WordDocumentToolComponent(root_path="", read_only=False)


def _tools(component: WordDocumentToolComponent) -> dict:
    return {t.name: t for t in asyncio.run(component._get_tools())}


class TestComponentSkeleton:
    def test_should_expose_required_inputs_when_instantiated(self, component: WordDocumentToolComponent) -> None:
        input_names = {inp.name for inp in component.inputs}
        assert {"root_path", "read_only"}.issubset(input_names)

    def test_should_have_display_metadata(self) -> None:
        assert WordDocumentToolComponent.display_name == "Word Document"
        assert WordDocumentToolComponent.name == "WordDocumentTool"

    def test_should_register_all_tools_when_not_read_only(self, component: WordDocumentToolComponent) -> None:
        names = set(_tools(component))
        assert names == {"docx_read", "docx_create", "docx_append_paragraph", "docx_replace_text", "docx_add_table"}

    def test_should_register_only_read_tool_when_read_only(self, sandbox: Path) -> None:  # noqa: ARG002
        component = WordDocumentToolComponent(root_path="", read_only=True)
        assert set(_tools(component)) == {"docx_read"}


class TestDocxCreateAndRead:
    def test_should_create_and_read_back_title(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        result = json.loads(tools["docx_create"].func(path="report.docx", title="My Report"))
        assert result["status"] == "ok"
        assert result["bytes_written"] > 0

        read = json.loads(tools["docx_read"].func(path="report.docx"))
        assert read["status"] == "ok"
        assert read["paragraphs"][0]["text"] == "My Report"
        assert read["paragraphs"][0]["style"] == "Title"
        assert read["tables"] == []

    def test_should_fail_when_file_exists_and_overwrite_false(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="report.docx")
        result = json.loads(tools["docx_create"].func(path="report.docx"))
        assert "error" in result

    def test_should_overwrite_when_flag_set(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="report.docx", title="First")
        result = json.loads(tools["docx_create"].func(path="report.docx", title="Second", overwrite=True))
        assert result["status"] == "ok"
        read = json.loads(tools["docx_read"].func(path="report.docx"))
        assert read["paragraphs"][0]["text"] == "Second"

    def test_should_reject_non_docx_extension(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        result = json.loads(tools["docx_create"].func(path="report.txt"))
        assert "error" in result
        assert ".docx" in result["error"]

    def test_should_reject_path_escaping_sandbox(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        result = json.loads(tools["docx_create"].func(path="../escape.docx"))
        assert "error" in result

    def test_should_error_reading_missing_file(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        result = json.loads(tools["docx_read"].func(path="missing.docx"))
        assert "error" in result

    def test_should_error_reading_non_docx_content(self, component: WordDocumentToolComponent, sandbox: Path) -> None:
        (sandbox / "fake.docx").write_text("not actually a docx", encoding="utf-8")
        tools = _tools(component)
        result = json.loads(tools["docx_read"].func(path="fake.docx"))
        assert "error" in result


class TestDocxAppendAndReplace:
    def test_should_append_paragraph_with_style(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        result = json.loads(tools["docx_append_paragraph"].func(path="doc.docx", text="Section", style="Heading 1"))
        assert result["status"] == "ok"
        read = json.loads(tools["docx_read"].func(path="doc.docx"))
        assert {"index": 0, "style": "Heading 1", "text": "Section"} in read["paragraphs"]

    def test_should_reject_unknown_style(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        result = json.loads(tools["docx_append_paragraph"].func(path="doc.docx", text="x", style="Not A Real Style"))
        assert "error" in result

    def test_should_replace_matching_paragraph(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        tools["docx_append_paragraph"].func(path="doc.docx", text="Hello old world")
        result = json.loads(tools["docx_replace_text"].func(path="doc.docx", old_text="old", new_text="new"))
        assert result["status"] == "ok"
        assert result["replacements"] == 1
        read = json.loads(tools["docx_read"].func(path="doc.docx"))
        assert any(p["text"] == "Hello new world" for p in read["paragraphs"])

    def test_should_fail_on_ambiguous_match_without_replace_all(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        tools["docx_append_paragraph"].func(path="doc.docx", text="target one")
        tools["docx_append_paragraph"].func(path="doc.docx", text="target two")
        result = json.loads(tools["docx_replace_text"].func(path="doc.docx", old_text="target", new_text="hit"))
        assert "error" in result
        assert result["matches"] == 2

    def test_should_replace_all_when_flag_set(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        tools["docx_append_paragraph"].func(path="doc.docx", text="target one")
        tools["docx_append_paragraph"].func(path="doc.docx", text="target two")
        result = json.loads(
            tools["docx_replace_text"].func(path="doc.docx", old_text="target", new_text="hit", replace_all=True)
        )
        assert result["status"] == "ok"
        assert result["replacements"] == 2

    def test_should_error_when_old_text_not_found(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        result = json.loads(tools["docx_replace_text"].func(path="doc.docx", old_text="nope", new_text="x"))
        assert "error" in result


class TestDocxTable:
    def test_should_add_table_with_data(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        result = json.loads(
            tools["docx_add_table"].func(path="doc.docx", rows=2, cols=2, data=[["a", "b"], ["c", "d"]])
        )
        assert result["status"] == "ok"
        read = json.loads(tools["docx_read"].func(path="doc.docx"))
        assert read["tables"] == [{"index": 0, "rows": [["a", "b"], ["c", "d"]]}]

    def test_should_reject_non_positive_dimensions(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        result = json.loads(tools["docx_add_table"].func(path="doc.docx", rows=0, cols=2))
        assert "error" in result

    def test_should_reject_oversized_table(self, component: WordDocumentToolComponent) -> None:
        tools = _tools(component)
        tools["docx_create"].func(path="doc.docx")
        result = json.loads(tools["docx_add_table"].func(path="doc.docx", rows=1000, cols=1000))
        assert "error" in result
