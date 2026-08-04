"""Unit tests for CommandExecutionToolComponent (argv-only subprocess agent tool)."""

from __future__ import annotations

import asyncio
import json
import sys
from typing import TYPE_CHECKING

import pytest
from lfx.components.files_and_knowledge import command_execution as command_execution_module
from lfx.components.files_and_knowledge.command_execution import CommandExecutionToolComponent
from lfx.components.files_and_knowledge.filesystem import FileSystemToolComponent

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="POSIX-only: subprocess env/rlimit assumptions")


@pytest.fixture(autouse=True)
def _auto_login(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(FileSystemToolComponent, "_resolve_auto_login", lambda self: True)  # noqa: ARG005


@pytest.fixture
def sandbox(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("EARTHMIND_FS_TOOL_BASE_DIR", str(tmp_path))
    shared = tmp_path / "shared"
    shared.mkdir(parents=True, exist_ok=True)
    return shared


@pytest.fixture
def component(sandbox: Path) -> CommandExecutionToolComponent:  # noqa: ARG001
    return CommandExecutionToolComponent(root_path="")


def _run_command_tool(component: CommandExecutionToolComponent):
    tools = asyncio.run(component._get_tools())
    assert len(tools) == 1
    assert tools[0].name == "run_command"
    return tools[0]


class TestComponentSkeleton:
    def test_should_have_display_metadata(self) -> None:
        assert CommandExecutionToolComponent.display_name == "Command Execution"
        assert CommandExecutionToolComponent.name == "CommandExecutionTool"

    def test_should_register_exactly_run_command(self, component: CommandExecutionToolComponent) -> None:
        _run_command_tool(component)  # asserts internally


class TestRunCommandBasics:
    def test_should_run_echo_successfully(self, component: CommandExecutionToolComponent) -> None:
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="echo", args=["hello", "world"]))
        assert result["status"] == "ok"
        assert result["returncode"] == 0
        assert result["stdout"] == "hello world\n"
        assert result["timed_out"] is False

    def test_should_report_nonzero_returncode_without_error_key(self, component: CommandExecutionToolComponent) -> None:
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="sh", args=["-c", "exit 3"]))
        assert result["status"] == "ok"
        assert result["returncode"] == 3
        assert "error" not in result

    def test_should_error_on_command_not_found(self, component: CommandExecutionToolComponent) -> None:
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="definitely_not_a_real_binary_xyz"))
        assert "error" in result

    def test_should_reject_empty_command(self, component: CommandExecutionToolComponent) -> None:
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command=""))
        assert "error" in result


class TestCwdSandbox:
    def test_should_default_cwd_to_sandbox_root(self, component: CommandExecutionToolComponent, sandbox: Path) -> None:
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="pwd"))
        assert result["stdout"].strip() == str(sandbox.resolve())

    def test_should_scope_cwd_to_sub_path(self, component: CommandExecutionToolComponent, sandbox: Path) -> None:
        (sandbox / "nested").mkdir()
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="pwd", cwd="nested"))
        assert result["stdout"].strip() == str((sandbox / "nested").resolve())

    def test_should_reject_cwd_escaping_sandbox(self, component: CommandExecutionToolComponent) -> None:
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="pwd", cwd="../../etc"))
        assert "error" in result


class TestEnvIsolation:
    def test_should_not_leak_host_environment_secrets(
        self, component: CommandExecutionToolComponent, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("EARTHMIND_TEST_SECRET", "should-not-leak")
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="printenv", args=["EARTHMIND_TEST_SECRET"]))
        # printenv exits non-zero and prints nothing when the var is unset in the child's env.
        assert result["status"] == "ok"
        assert result["returncode"] != 0
        assert "should-not-leak" not in result["stdout"]


class TestTimeoutAndTruncation:
    def test_should_time_out_long_running_command(self, component: CommandExecutionToolComponent) -> None:
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="sleep", args=["5"], timeout=1))
        assert result["timed_out"] is True
        assert "error" in result

    def test_should_truncate_oversized_output(
        self, component: CommandExecutionToolComponent, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(command_execution_module, "MAX_OUTPUT_CHARS", 10)
        tool = _run_command_tool(component)
        result = json.loads(tool.func(command="echo", args=["a much longer line of output than the cap"]))
        assert result["stdout_truncated"] is True
        assert len(result["stdout"]) == 10
