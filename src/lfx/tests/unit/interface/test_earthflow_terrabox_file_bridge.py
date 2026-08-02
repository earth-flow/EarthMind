from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

from lfx.interface.earthflow_terrabox import (
    _MAX_FILE_CANDIDATES,
    _MAX_SCAN_DEPTH,
    bridge_generated_files,
    find_file_like_values,
)


def test_find_file_like_values_matches_by_extension_regardless_of_key_name():
    outputs = {
        "info": {"tool": "stac_basic"},
        # Real-world example (terrabox stac_basic.py): the key is just "saved",
        # not "*_path" — extension is the only reliable signal available.
        "saved": "/abs/terrabox/runtime/outputs/user/exec/stac_basic/scene.tif",
        "ignored_dir": "/abs/terrabox/runtime/outputs/user/exec",  # no known extension
        "count": 42,  # non-string, ignored regardless of key
    }

    matches = find_file_like_values(outputs)

    assert matches == [("saved", "/abs/terrabox/runtime/outputs/user/exec/stac_basic/scene.tif")]


def test_find_file_like_values_recurses_into_nested_dicts_and_lists():
    outputs = {
        "results": [
            {"report_path": "/tmp/report.docx"},
            {"nested": {"artifact_dir": "/tmp/nested/table.xlsx"}},
        ],
    }

    matches = find_file_like_values(outputs)

    assert ("results[0].report_path", "/tmp/report.docx") in matches
    assert ("results[1].nested.artifact_dir", "/tmp/nested/table.xlsx") in matches


def test_find_file_like_values_caps_total_matches():
    outputs = {f"path_{i}": f"/tmp/file_{i}.png" for i in range(_MAX_FILE_CANDIDATES + 5)}

    matches = find_file_like_values(outputs)

    assert len(matches) == _MAX_FILE_CANDIDATES


def test_find_file_like_values_stops_at_max_depth():
    # Build a dict nested deeper than _MAX_SCAN_DEPTH with a match only at the bottom.
    innermost: dict[str, Any] = {"leaf_path": "/tmp/too_deep.png"}
    outputs: dict[str, Any] = innermost
    for _ in range(_MAX_SCAN_DEPTH + 3):
        outputs = {"wrapper": outputs}

    matches = find_file_like_values(outputs)

    assert matches == []


async def test_bridge_generated_files_uploads_matches_and_normalizes_result():
    payload = {"success": True, "outputs": {"saved": "/abs/runtime/scene.tif"}}

    class FakeResponse:
        content = b"tif-bytes"

        def raise_for_status(self) -> None:
            return None

    class FakeUploaded:
        id = "11111111-1111-1111-1111-111111111111"
        name = "scene.tif"
        size = 9

    with (
        patch("lfx.interface.earthflow_terrabox.requests.get", return_value=FakeResponse()) as fake_get,
        patch(
            "lfx.interface.earthflow_terrabox._upload_bridged_file",
            new=AsyncMock(return_value=FakeUploaded()),
        ) as fake_upload,
    ):
        bridged = await bridge_generated_files(
            payload, api_key="test-key", base_url="http://terrabox.local/", user_id="user-1"
        )

    fake_get.assert_called_once_with(
        "http://terrabox.local/v1/sdk/runtime/files",
        params={"path": "/abs/runtime/scene.tif"},
        headers={"X-API-Key": "test-key"},
        timeout=60,
    )
    fake_upload.assert_called_once_with("scene.tif", b"tif-bytes", "user-1")
    assert bridged == [
        {
            "field": "saved",
            "file_id": "11111111-1111-1111-1111-111111111111",
            "name": "scene.tif",
            "size": 9,
        }
    ]


async def test_bridge_generated_files_returns_empty_when_no_candidates():
    bridged = await bridge_generated_files(
        {"success": True, "outputs": {"distance": 313.7}},
        api_key="test-key",
        base_url="http://terrabox.local",
        user_id="user-1",
    )

    assert bridged == []


async def test_bridge_generated_files_swallows_fetch_failures():
    payload = {"success": True, "outputs": {"saved": "/abs/runtime/scene.tif"}}

    with patch("lfx.interface.earthflow_terrabox.requests.get", side_effect=RuntimeError("boom")):
        bridged = await bridge_generated_files(
            payload, api_key="test-key", base_url="http://terrabox.local", user_id="user-1"
        )

    assert bridged == []


async def test_bridge_generated_files_swallows_upload_failures():
    payload = {"success": True, "outputs": {"saved": "/abs/runtime/scene.tif"}}

    class FakeResponse:
        content = b"tif-bytes"

        def raise_for_status(self) -> None:
            return None

    with (
        patch("lfx.interface.earthflow_terrabox.requests.get", return_value=FakeResponse()),
        patch(
            "lfx.interface.earthflow_terrabox._upload_bridged_file",
            new=AsyncMock(side_effect=RuntimeError("upload failed")),
        ),
    ):
        bridged = await bridge_generated_files(
            payload, api_key="test-key", base_url="http://terrabox.local", user_id="user-1"
        )

    assert bridged == []
