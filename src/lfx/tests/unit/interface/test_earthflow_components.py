from __future__ import annotations

import sys
from typing import Any

from lfx.custom.utils import create_component_template
from lfx.interface.earthflow_components import apply_earthflow_component_policy
from lfx.interface.earthflow_terrabox import (
    EARTHFLOW_TOOLS_CATEGORY,
    TerraboxToolSpec,
    build_terrabox_component_template,
    load_terrabox_tool_specs,
)


def _stub_component(display_name: str) -> dict[str, Any]:
    return {
        "display_name": display_name,
        "description": f"{display_name} component",
        "template": {},
    }


def _distance_spec() -> TerraboxToolSpec:
    return TerraboxToolSpec(
        slug="geo_basic.distance",
        name="Distance",
        description="Measure distance between two lon/lat points.",
        parameters={
            "type": "object",
            "properties": {
                "lon1": {"type": "number", "description": "First longitude"},
                "lat1": {"type": "number", "description": "First latitude"},
                "lon2": {"type": "number", "description": "Second longitude"},
                "lat2": {"type": "number", "description": "Second latitude"},
                "unit": {"type": "string", "enum": ["meters", "kilometers"], "default": "meters"},
                "metadata": {"type": "object", "description": "Optional request metadata"},
            },
            "required": ["lon1", "lat1", "lon2", "lat2"],
        },
    )


def test_earthflow_policy_filters_native_components_and_injects_terrabox_tools():
    all_types = {
        "input_output": {
            "ChatInput": _stub_component("Chat Input"),
            "ChatOutput": _stub_component("Chat Output"),
        },
        "deepseek": {"DeepSeekModelComponent": _stub_component("DeepSeek")},
        "tools": {
            "TavilyAISearch": _stub_component("Tavily"),
            "WikipediaAPI": _stub_component("Wikipedia"),
            "PythonREPLTool": _stub_component("Python REPL"),
        },
        "Notion": {"NotionListPages": _stub_component("Notion List Pages")},
        "openai": {"OpenAIModelComponent": _stub_component("OpenAI")},
    }

    filtered = apply_earthflow_component_policy(all_types, terrabox_tools=[_distance_spec()])

    assert "ChatInput" in filtered["input_output"]
    assert "ChatOutput" in filtered["input_output"]
    assert "DeepSeekModelComponent" in filtered["deepseek"]
    assert "TavilyAISearch" in filtered["tools"]
    assert "WikipediaAPI" in filtered["tools"]
    assert "PythonREPLTool" not in filtered["tools"]
    assert "Notion" not in filtered
    assert "openai" not in filtered
    assert "TerraboxGeoBasicDistance" in filtered[EARTHFLOW_TOOLS_CATEGORY]


def test_terrabox_toolspec_builds_evalable_langflow_tool_component_template():
    template = build_terrabox_component_template(_distance_spec())

    assert template["display_name"] == "Distance"
    assert template["description"] == "Measure distance between two lon/lat points."
    assert template["icon"] == "Satellite"
    assert {"JSON", "Tool"}.issubset(set(template["base_classes"]))
    assert [output["name"] for output in template["outputs"]] == ["api_run_model", "api_build_tool"]
    assert template["template"]["base_url"]["value"] == "http://localhost:8000"
    assert template["template"]["api_key"]["_input_type"] == "SecretStrInput"
    assert template["template"]["lon1"]["_input_type"] == "FloatInput"
    assert template["template"]["unit"]["_input_type"] == "DropdownInput"
    assert template["template"]["param_metadata"]["_input_type"] == "DictInput"

    rebuilt_template, instance = create_component_template(
        component={
            "code": template["template"]["code"]["value"],
            "output_types": [],
        },
    )

    assert rebuilt_template["display_name"] == "Distance"
    assert instance.display_name == "Distance"


def test_generated_terrabox_component_executes_via_sdk_rest_endpoint(monkeypatch):
    template = build_terrabox_component_template(_distance_spec())
    _, instance = create_component_template(
        component={
            "code": template["template"]["code"]["value"],
            "output_types": [],
        },
    )
    instance.base_url = "http://terrabox.local/"
    instance.api_key = "test-key"
    instance.timeout = 7
    instance.lon1 = 1.0
    instance.lat1 = 2.0
    instance.lon2 = 3.0
    instance.lat2 = 4.0
    instance.unit = "kilometers"
    instance.param_metadata = {"source": "unit-test"}

    captured: dict[str, Any] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {
                "success": True,
                "outputs": {"distance": 313.7},
                "execution_id": "exec-1",
            }

    def fake_post(url: str, *, headers: dict[str, str], json: dict[str, Any], timeout: int):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr("requests.post", fake_post)

    result = instance.run_model()

    assert captured == {
        "url": "http://terrabox.local/v1/sdk/tools/geo_basic.distance/execute",
        "headers": {"X-API-Key": "test-key"},
        "json": {
            "inputs": {
                "lon1": 1.0,
                "lat1": 2.0,
                "lon2": 3.0,
                "lat2": 4.0,
                "unit": "kilometers",
                "metadata": {"source": "unit-test"},
            }
        },
        "timeout": 7,
    }
    assert result[0].data["success"] is True
    assert result[0].data["outputs"]["distance"] == 313.7

    tool = instance.build_tool()
    assert tool.name == "geo_basic_distance"
    assert set(tool.args_schema.model_fields) >= {"lon1", "lat1", "lon2", "lat2", "unit", "metadata"}


def test_terrabox_reserved_frontend_field_names_are_aliased_without_changing_payload(monkeypatch):
    spec = TerraboxToolSpec(
        slug="earth_sci.microwave_ddm",
        name="Microwave DDM",
        description="Uses beta as a model parameter.",
        parameters={
            "type": "object",
            "properties": {
                "beta": {"type": "number", "description": "Model beta parameter"},
            },
            "required": ["beta"],
        },
    )

    template = build_terrabox_component_template(spec)

    assert "beta" not in template["template"]
    assert template["template"]["param_beta"]["display_name"] == "Beta"
    assert template["template"]["param_beta"]["_input_type"] == "FloatInput"

    _, instance = create_component_template(
        component={
            "code": template["template"]["code"]["value"],
            "output_types": [],
        },
    )
    instance.base_url = "http://terrabox.local"
    instance.api_key = "test-key"
    instance.timeout = 7
    instance.param_beta = 0.42

    captured: dict[str, Any] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {"success": True, "outputs": {"ok": True}}

    def fake_post(url: str, *, headers: dict[str, str], json: dict[str, Any], timeout: int):
        captured.update({"json": json})
        return FakeResponse()

    monkeypatch.setattr("requests.post", fake_post)

    instance.run_model()

    assert captured["json"] == {"inputs": {"beta": 0.42}}


def _write_fake_terrabox_package(tmp_path):
    src = tmp_path / "src"
    package = src / "terrabox"
    core = package / "core"
    toolkits = package / "toolkits"
    core.mkdir(parents=True)
    toolkits.mkdir(parents=True)
    (package / "__init__.py").write_text("")
    (core / "__init__.py").write_text("")
    (toolkits / "__init__.py").write_text("")
    (core / "registry.py").write_text(
        """
_TOOL_SPECS = []


class ToolSpec:
    def __init__(
        self,
        *,
        slug,
        name,
        description,
        parameters,
        requires_connection=False,
        required_scopes=None,
    ):
        self.slug = slug
        self.name = name
        self.description = description
        self.parameters = parameters
        self.requires_connection = requires_connection
        self.required_scopes = required_scopes


class _Registry:
    def clear(self):
        _TOOL_SPECS.clear()


registry = _Registry()


def list_tools():
    return list(_TOOL_SPECS)
"""
    )
    (package / "extensions.py").write_text(
        """
from terrabox.core.registry import _TOOL_SPECS


class Registrar:
    def toolkit(self, **kwargs):
        return None

    def tool(self, spec, handler):
        _TOOL_SPECS.append(spec)
"""
    )

    toolkit_slugs = {
        "geobasic": ["geo_basic.distance"],
        "geopatch": ["geopatch.train_init", "geopatch.generate_seg"],
        "geo_perception": [
            "geo_perception.vlm_analyze",
            "geo_perception.sam2_segment",
            "geo_perception.remoteclip_analysis",
            "geo_perception.strip_rcnn_detect",
            "geo_perception.remotesam",
            "geo_perception.instructsam",
            "geo_perception.draw_bboxes",
            "geo_perception.add_text",
            "geo_perception.ocr_extract",
            "geo_perception.bbox_expand",
            "geo_perception.bbox_to_centroid",
            "geo_perception.centroid_distance_extremes",
            "geo_perception.bbox_area",
        ],
    }
    for module_name, slugs in toolkit_slugs.items():
        registrations = "\n".join(
            (
                "    registrar.tool("
                f"ToolSpec(slug={slug!r}, name={slug!r}, description={slug!r}, "
                "parameters={'type': 'object', 'properties': {}}, requires_connection=False), "
                "lambda arguments, context, account: {})"
            )
            for slug in slugs
        )
        (toolkits / f"{module_name}.py").write_text(
            f"""
from terrabox.core.registry import ToolSpec


def setup(registrar):
    registrar.toolkit(name={module_name!r}, description='', version='0')
{registrations}
"""
        )
    return src


def _drop_fake_terrabox_modules(monkeypatch):
    for name in list(sys.modules):
        if name == "terrabox" or name.startswith("terrabox."):
            monkeypatch.delitem(sys.modules, name, raising=False)


def test_default_terrabox_tool_filter_exposes_lightweight_remaining_tools(tmp_path, monkeypatch):
    terrabox_src = _write_fake_terrabox_package(tmp_path)
    _drop_fake_terrabox_modules(monkeypatch)

    specs = load_terrabox_tool_specs(
        terrabox_src=terrabox_src,
        include_toolkits={"geo_basic", "geopatch", "geo_perception"},
        exclude_toolkits=set(),
    )
    slugs = {spec.slug for spec in specs}

    assert "geo_basic.distance" in slugs
    assert "geopatch.train_init" in slugs
    assert "geopatch.generate_seg" in slugs
    assert "geo_perception.bbox_area" in slugs
    assert "geo_perception.draw_bboxes" in slugs
    assert "geo_perception.ocr_extract" in slugs
    assert "geo_perception.vlm_analyze" not in slugs
    assert "geo_perception.sam2_segment" not in slugs
    assert "geo_perception.remoteclip_analysis" not in slugs
    assert "geo_perception.strip_rcnn_detect" not in slugs
    assert "geo_perception.remotesam" not in slugs
    assert "geo_perception.instructsam" not in slugs


def test_terrabox_tool_slug_allowlist_and_denylist_precisely_filter_tools(tmp_path, monkeypatch):
    terrabox_src = _write_fake_terrabox_package(tmp_path)
    _drop_fake_terrabox_modules(monkeypatch)
    monkeypatch.setenv("EARTHFLOW_TERRABOX_TOOLS", "geo_basic.distance,geo_perception.bbox_area")
    monkeypatch.setenv("EARTHFLOW_TERRABOX_EXCLUDE_TOOLS", "geo_basic.distance")

    specs = load_terrabox_tool_specs(
        terrabox_src=terrabox_src,
        include_toolkits={"geo_basic", "geopatch", "geo_perception"},
        exclude_toolkits=set(),
    )

    assert [spec.slug for spec in specs] == ["geo_perception.bbox_area"]
