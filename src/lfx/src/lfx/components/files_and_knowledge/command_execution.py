"""Command-execution tool component: runs a single argv command for agents.

Security model (read this before wiring the tool into any toolkit):

  * Dispatch is argv-list only (``shell=False``) — this tool never parses a
    command *string*, so content the agent embeds into ``args`` (e.g. text
    read from an untrusted file/URL) cannot smuggle extra shell syntax
    (``;``, ``&&``, ``|``, backticks) into the call. It does NOT stop the
    agent from *choosing* to run a shell interpreter itself (``command="bash"``,
    ``args=["-c", "..."]``) — that remains possible and is a deliberate,
    visible tool call rather than an invisible injection.
  * ``cwd`` defaults to the caller's filesystem-tool sandbox root and is
    validated the same way as ``FileSystemToolComponent`` paths — but this is
    only a *default working directory*, not an OS-level jail. Unlike the file
    tools, this component cannot inspect an arbitrary command's arguments to
    tell which ones are paths, so it cannot enforce that the process stays
    inside the sandbox. A command given an absolute path or ``..`` can read
    or write anywhere the Terraflow server's OS user can.
  * The subprocess environment is rebuilt from an explicit allow-list (PATH,
    HOME, LANG, LC_ALL, TMPDIR, TERM) rather than inherited from
    ``os.environ`` — the server process's own environment may hold secrets
    (API keys, DB URLs) that must never be exposed to an agent-invoked
    command.
  * Best-effort POSIX resource limits (CPU time, address space, output file
    size, no core dumps) bound a single runaway process. They do not defend
    against a fork bomb (that needs RLIMIT_NPROC or cgroups, deliberately not
    set here — RLIMIT_NPROC is scoped to the real OS user, so setting it
    inside a forked child could starve the Terraflow server process itself).

None of this amounts to OS-level sandboxing (container/namespace isolation).
It is deliberately not wired into any toolkit by default — see
``EARTHFLOW_ASSISTANT_CLI_TOOL_ENABLED`` in ``flow_builder_assistant.py``.
"""

from __future__ import annotations

import os
import subprocess
import sys
from typing import TYPE_CHECKING

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from lfx.components.files_and_knowledge.filesystem import FileSystemToolComponent
from lfx.custom.custom_component.component import Component
from lfx.inputs.inputs import StrInput
from lfx.io import Output
from lfx.schema.data import Data

if TYPE_CHECKING:
    from pathlib import Path

    from lfx.field_typing import Tool

DEFAULT_TIMEOUT_SECONDS = 30.0
MAX_TIMEOUT_SECONDS = 120.0
MIN_TIMEOUT_SECONDS = 1.0
MAX_OUTPUT_CHARS = 50_000  # per stream (stdout/stderr)

# Resource limits applied to the child process on POSIX (best-effort — see
# module docstring for what these do and do not defend against).
_RLIMIT_AS_BYTES = 2 * 1024**3  # 2 GiB address space
_RLIMIT_FSIZE_BYTES = 50 * 1024**2  # 50 MB max file size the child may write
_CPU_LIMIT_HEADROOM_SECONDS = 5  # RLIMIT_CPU = clamped wall timeout + this


class _RunCommandArgs(BaseModel):
    command: str = Field(..., description="Executable name (resolved via PATH) or path, e.g. 'git', 'python3'.")
    args: list[str] = Field(default_factory=list, description="Argument list. Never shell-parsed.")
    cwd: str | None = Field(
        default=None,
        description="Working directory, relative to the sandbox root. Defaults to the sandbox root itself.",
    )
    timeout: float | None = Field(
        default=None,
        description=f"Timeout in seconds (default {DEFAULT_TIMEOUT_SECONDS}, max {MAX_TIMEOUT_SECONDS}).",
    )


def _set_resource_limits(cpu_seconds: int) -> None:
    """``preexec_fn`` target: apply best-effort POSIX rlimits in the forked child.

    Deliberately does not touch RLIMIT_NPROC — see module docstring.
    """
    import resource

    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
    resource.setrlimit(resource.RLIMIT_AS, (_RLIMIT_AS_BYTES, _RLIMIT_AS_BYTES))
    resource.setrlimit(resource.RLIMIT_FSIZE, (_RLIMIT_FSIZE_BYTES, _RLIMIT_FSIZE_BYTES))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def _truncate(text: str | None) -> tuple[str, bool]:
    if text is None:
        return "", False
    if len(text) > MAX_OUTPUT_CHARS:
        return text[:MAX_OUTPUT_CHARS], True
    return text, False


class CommandExecutionToolComponent(Component):
    display_name = "Command Execution"
    description = "Runs a single command (argv-list, no shell parsing) for agents. Not an OS-level sandbox."
    icon = "square-terminal"
    name = "CommandExecutionTool"

    add_tool_output = True

    inputs = [
        StrInput(
            name="root_path",
            display_name="Workspace Sub-path",
            required=False,
            value="",
            info=(
                "Sub-folder inside your sandboxed workspace used as the default `cwd`. "
                "Leave empty to use the root of the workspace."
            ),
        ),
        StrInput(
            name="tool_mode_trigger",
            display_name="",
            show=False,
            tool_mode=True,
            required=False,
        ),
    ]

    outputs = [
        Output(display_name="JSON", name="metadata", method="build_metadata", types=["Data"]),
    ]

    def build_metadata(self) -> Data:
        return Data(
            data={
                "root_path": self.root_path,
                "tools_registered": ["run_command"],
                "sandboxed": False,
                "note": "cwd defaults to the workspace sandbox root but this is not an OS-level jail.",
            }
        )

    def _fs(self) -> FileSystemToolComponent:
        fs = FileSystemToolComponent(root_path=self.root_path, read_only=True)
        fs._user_id = getattr(self, "_user_id", None)  # noqa: SLF001 — intentional cross-component sandbox reuse
        fs._force_isolation = getattr(self, "_force_isolation", False)  # noqa: SLF001
        return fs

    def _resolve_cwd(self, cwd: str | None) -> Path | dict:
        fs = self._fs()
        try:
            resolved = fs._validate_path(cwd) if cwd else fs._validate_root()  # noqa: SLF001
        except PermissionError as exc:
            return {"error": str(exc), "cwd": cwd}
        if not resolved.exists():
            try:
                resolved.mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                return {"error": f"Cannot create cwd: {exc.strerror or exc}", "cwd": cwd}
        elif not resolved.is_dir():
            return {"error": f"cwd is not a directory: {cwd}", "cwd": cwd}
        return resolved

    def _build_env(self, home: Path) -> dict[str, str]:
        return {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": str(home),
            "LANG": os.environ.get("LANG", "C.UTF-8"),
            "LC_ALL": os.environ.get("LC_ALL", "C.UTF-8"),
            "TMPDIR": str(home),
            "TERM": "dumb",
        }

    def _run_command(
        self,
        command: str,
        args: list[str] | None = None,
        cwd: str | None = None,
        timeout: float | None = None,
    ) -> dict:
        if not command or "\x00" in command:
            return {"error": "command must be a non-empty string without NUL bytes"}
        argv = [command, *(args or [])]

        resolved_cwd = self._resolve_cwd(cwd)
        if isinstance(resolved_cwd, dict):
            return resolved_cwd

        clamped_timeout = (
            DEFAULT_TIMEOUT_SECONDS if timeout is None else max(MIN_TIMEOUT_SECONDS, min(timeout, MAX_TIMEOUT_SECONDS))
        )
        env = self._build_env(resolved_cwd)
        preexec_fn = None
        if sys.platform != "win32":
            cpu_seconds = int(clamped_timeout) + _CPU_LIMIT_HEADROOM_SECONDS

            def preexec_fn() -> None:  # closure needed to capture cpu_seconds
                _set_resource_limits(cpu_seconds)

        try:
            completed = subprocess.run(  # noqa: S603 — argv list, shell=False by construction; see module docstring
                argv,
                cwd=str(resolved_cwd),
                env=env,
                timeout=clamped_timeout,
                capture_output=True,
                text=True,
                shell=False,
                preexec_fn=preexec_fn,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            stdout, stdout_truncated = _truncate(exc.stdout if isinstance(exc.stdout, str) else None)
            stderr, stderr_truncated = _truncate(exc.stderr if isinstance(exc.stderr, str) else None)
            return {
                "error": f"Command timed out after {clamped_timeout}s",
                "command": command,
                "args": args or [],
                "timed_out": True,
                "stdout": stdout,
                "stderr": stderr,
                "stdout_truncated": stdout_truncated,
                "stderr_truncated": stderr_truncated,
            }
        except FileNotFoundError:
            return {"error": f"Command not found: {command}", "command": command}
        except PermissionError as exc:
            return {"error": f"Cannot execute {command}: {exc}", "command": command}
        except OSError as exc:
            return {"error": f"Failed to run {command}: {exc}", "command": command}

        stdout, stdout_truncated = _truncate(completed.stdout)
        stderr, stderr_truncated = _truncate(completed.stderr)
        return {
            "status": "ok",
            "command": command,
            "args": args or [],
            "cwd": cwd or "",
            "returncode": completed.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "stdout_truncated": stdout_truncated,
            "stderr_truncated": stderr_truncated,
            "timed_out": False,
        }

    async def _get_tools(self) -> list[Tool]:
        return [self._make_run_command_tool()]

    def _make_run_command_tool(self) -> StructuredTool:
        def _run(command: str, args: list[str] | None = None, cwd: str | None = None, timeout: float | None = None):
            import json

            return json.dumps(self._run_command(command, args=args, cwd=cwd, timeout=timeout))

        return StructuredTool.from_function(
            name="run_command",
            description=(
                "Run a single command as an argv list (never shell-parsed — no pipes/redirects/&& "
                "in a single call). Defaults to the sandboxed workspace as the working directory. "
                f"Timeout defaults to {DEFAULT_TIMEOUT_SECONDS}s, max {MAX_TIMEOUT_SECONDS}s. "
                f"Output is captured and truncated at {MAX_OUTPUT_CHARS} characters per stream. "
                "Not an OS-level sandbox: an absolute path or '..' in an argument can reach outside "
                "the workspace, same as it would from a real terminal."
            ),
            func=_run,
            args_schema=_RunCommandArgs,
            tags=["run_command"],
        )
