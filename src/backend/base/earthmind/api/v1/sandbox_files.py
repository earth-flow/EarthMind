"""Browse the shared FileSystemTool sandbox (project-wide "Files" view).

`FileSystemTool`/`WordDocumentTool`/`CommandExecutionTool` (see
`lfx.components.files_and_knowledge`) write raw bytes to a sandboxed
directory on local disk, but nothing previously served that directory over
HTTP -- a file an agent created there (e.g. a generated .docx) was invisible
to the web app. This router lists and downloads whatever is in the shared
sandbox root.

This deployment runs with `AUTO_LOGIN=True` (single shared sandbox, not
per-user isolation -- see `FileSystemToolComponent._validate_root`), so these
endpoints intentionally do not scope by user beyond requiring authentication:
any authenticated user already sees the same shared tree via the file tools
themselves. Passing the current user's id through still makes these endpoints
behave correctly if a deployment ever flips to isolated (`AUTO_LOGIN=False`)
per-user mode.
"""

from io import BytesIO

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from lfx.components.files_and_knowledge.filesystem import (
    MAX_FILE_SIZE_BYTES,
    FileSystemToolComponent,
    _read_bytes_no_follow,
    list_sandbox_files,
)
from lfx.utils.helpers import build_content_type_from_extension

from earthmind.api.utils import CurrentActiveUser, build_content_disposition

router = APIRouter(prefix="/sandbox-files", tags=["Sandbox Files"])


def _shared_fs_component(current_user: CurrentActiveUser) -> FileSystemToolComponent:
    """A read-only `FileSystemToolComponent` bound to the shared sandbox root.

    Reuses the same `_validate_root()`/`_validate_path()` sandbox-boundary
    logic every other file tool in this codebase relies on (see
    `word_document.py`'s and `command_execution.py`'s own `_fs()` helpers for
    the established pattern) rather than reimplementing path safety here.
    """
    component = FileSystemToolComponent(root_path="", read_only=True)
    component._user_id = str(current_user.id)  # noqa: SLF001 — see module docstring
    return component


@router.get("/")
async def list_files(current_user: CurrentActiveUser):
    """List every file in the shared sandbox, recursively."""
    component = _shared_fs_component(current_user)
    try:
        root = component._validate_root()  # noqa: SLF001 — intentional reuse, see module docstring
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    return {"files": list_sandbox_files(root)}


@router.get("/download")
async def download_file(path: str, current_user: CurrentActiveUser):
    """Download a single file from the shared sandbox by its relative path."""
    component = _shared_fs_component(current_user)
    try:
        resolved = component._validate_path(path)  # noqa: SLF001 — intentional reuse, see module docstring
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    try:
        size = resolved.stat().st_size
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot stat file: {exc.strerror or exc}") from exc
    if size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File size {size} exceeds limit of {MAX_FILE_SIZE_BYTES} bytes")

    try:
        content = _read_bytes_no_follow(resolved)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read file: {exc.strerror or exc}") from exc

    extension = resolved.suffix.lstrip(".")
    content_type = build_content_type_from_extension(extension) or "application/octet-stream"
    headers = {
        "Content-Disposition": build_content_disposition(resolved.name),
        "Content-Length": str(len(content)),
    }
    return StreamingResponse(BytesIO(content), media_type=content_type, headers=headers)
