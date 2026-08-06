# Terraflow Terrabox Tool Components

This document summarizes the current Terraflow integration for Terrabox geospatial
tools. The goal is to make Terraflow's Langflow UI more focused on remote-sensing
and geospatial workflows while exposing Terrabox tools as reusable Langflow
components.

## Background

Terraflow is based on Langflow and provides the workflow and agent orchestration
layer. Terrabox provides the geospatial tool backend: tool registration, JSON
Schema definitions, REST execution, runtime files, API keys, and MCP exposure.

The two projects stay independently deployed and versioned. Terraflow depends
on Terrabox in two distinct ways, and both are *live* HTTP calls against a
running Terrabox instance:

- **Component generation (discovery):** `load_terrabox_tool_specs()`
  (`src/lfx/src/lfx/interface/earthflow_terrabox.py`) calls
  `GET {TERRALINK_BASE_URL}/v1/sdk/toolkits`, authenticated the same way as
  tool execution (`X-API-Key: $TERRALINK_API_KEY`). This is the same catalog
  Terrabox's own `terralink` frontend renders (via the JWT-authenticated
  `/v1/gui/toolkits` twin of this endpoint), just fetched with an API key
  instead of a browser session.
- **Tool execution (runtime):** generated components call
  `POST {TERRALINK_BASE_URL}/v1/sdk/tools/{slug}/execute`.

Because discovery is a live call rather than a build-time Python import, a
toolkit or tool Terrabox adds shows up automatically — no Terraflow dependency
bump, code change, or (for existing toolkits) even a restart is required. See
[Automatic Toolkit Discovery](#automatic-toolkit-discovery) below.

## Implementation Overview

The integration has two parts.

First, Terraflow filters the native Langflow component catalog with an allowlist.
This hides unrelated default components while keeping the components needed for
remote-sensing workflows, including chat input/output, DeepSeek, Agent, Prompt
Template, search tools, flow controls, basic file handling, and common data
processing components.

Second, Terraflow fetches Terrabox `ToolSpec` definitions live over HTTP and
converts them into Langflow component templates. Each generated Terrabox
component exposes:

- `Terrabox Base URL`, defaulting to `http://localhost:8000`.
- `Terrabox API Key`, kept as a secret input.
- `Timeout`.
- Tool-specific inputs generated from the Terrabox JSON Schema.
- A JSON output for direct tool execution.
- A Tool output for Agent tool-calling workflows.

The main code paths are:

- `src/lfx/src/lfx/interface/components.py`
- `src/lfx/src/lfx/interface/earthflow_components.py`
- `src/lfx/src/lfx/interface/earthflow_terrabox.py`
- `src/lfx/tests/unit/interface/test_earthflow_components.py`

## Default Tool Policy

Terraflow currently enables 105 Terrabox tool components by default (out of the
16 toolkits / ~118 tools Terrabox reports today). The default policy is
**every toolkit Terrabox reports, except an explicit exclude list**
(`DEFAULT_EXCLUDED_TERRABOX_TOOLKITS`) — not a fixed allowlist. This is what
makes discovery automatic: a new toolkit Terrabox adds isn't excluded by
default, so it's included the next time the tool cache is refreshed (see
[Automatic Toolkit Discovery](#automatic-toolkit-discovery)), with no
Terraflow-side allowlist edit required. As of this writing that's:

- `geo_basic`
- `geo_raster`
- `earth_sci`
- `disaster_response`
- `stac_basic`
- `osm_gis`
- `geoanalysis`
- `geo_statistics`
- `raster_viewer`
- `geopatch`
- lightweight `geo_perception` tools

The lightweight `geo_perception` subset is limited to:

- `geo_perception.draw_bboxes`
- `geo_perception.add_text`
- `geo_perception.ocr_extract`
- `geo_perception.bbox_expand`
- `geo_perception.bbox_to_centroid`
- `geo_perception.centroid_distance_extremes`
- `geo_perception.bbox_area`

The following `geo_perception` model-service tools are excluded by default
because they require Docker, model services, model weights, and additional
runtime setup:

- `geo_perception.vlm_analyze`
- `geo_perception.sam2_segment`
- `geo_perception.remoteclip_analysis`
- `geo_perception.strip_rcnn_detect`
- `geo_perception.remotesam`
- `geo_perception.instructsam`

The following high-risk or external-connection toolkits are also not enabled by
default (`DEFAULT_EXCLUDED_TERRABOX_TOOLKITS`):

- `bash`
- `ipython`
- `github`
- `bing_search`
- `example`

## Configuration

Terraflow component filtering can be disabled if needed:

```bash
export EARTHFLOW_COMPONENTS_ENABLED=0
```

Terrabox toolkit-level filters. `EARTHFLOW_TERRABOX_TOOLKITS` is an **allowlist
override** — set it to restrict Terraflow to exactly those toolkits; leave it
unset (the default) to include every toolkit Terrabox reports except
`EARTHFLOW_TERRABOX_EXCLUDE_TOOLKITS`:

```bash
export EARTHFLOW_TERRABOX_TOOLKITS=geo_basic,geo_raster,earth_sci
export EARTHFLOW_TERRABOX_EXCLUDE_TOOLKITS=bash,ipython,github,bing_search,example
```

Terrabox tool slug-level filters:

```bash
export EARTHFLOW_TERRABOX_TOOLS=geo_basic.distance,geo_perception.bbox_area
export EARTHFLOW_TERRABOX_EXCLUDE_TOOLS=geo_perception.vlm_analyze
```

Terrabox service configuration -- both discovery (`GET /v1/sdk/toolkits`) and
execution use these:

```bash
export TERRALINK_BASE_URL=http://127.0.0.1:8000
export TERRALINK_API_KEY=tlk_live_...
```

Do not commit real Terrabox API keys. `TERRALINK_API_KEY` is read from the
environment for tool *discovery*; for tool *execution* it can also be
overridden per-component in the secret field.

### Automatic Toolkit Discovery

`load_terrabox_tool_specs()` fetches Terrabox's tool catalog live, so a
toolkit/tool Terrabox adds is visible to that function immediately. Getting it
into a *running* Terraflow server's sidebar (`GET /api/v1/all`) additionally
needs the in-memory component cache refreshed, since
`get_and_cache_all_types_dict` only calls the Terrabox-loading policy once per
process. Two mechanisms do this without a restart:

- **Periodic background refresh:** a background task calls
  `refresh_terrabox_components_cache()` every
  `EARTHFLOW_TERRABOX_TOOLS_REFRESH_INTERVAL_SECONDS` (default 600s / 10
  minutes). Disable with `EARTHFLOW_TERRABOX_TOOLS_REFRESH=false`.
- **On-demand refresh:** `POST /api/v1/all/refresh-terrabox-tools`
  (superuser-only) triggers the same refresh immediately.

A full process restart also picks up changes, same as before, and remains
necessary for anything this refresh doesn't cover (e.g. toggling
`EARTHFLOW_COMPONENTS_ENABLED` itself).

## UI Verification

The screenshot below shows the filtered Terraflow Langflow UI with the
`earthflow tools` category and a generated Terrabox Distance component on the
canvas.

![Earthflow tools and Distance component](../static/img/terraflow-terrabox/figure-1-earthflow-tools-distance.png)

The Distance component can run as a JSON-output component. In this mode, the
component calls the Terrabox REST API directly and returns the tool result to
downstream components such as Chat Output.

![Distance JSON result](../static/img/terraflow-terrabox/figure-2-distance-json-result.png)

The same generated Terrabox component also exposes a Tool output. This allows an
Agent to call the Terrabox tool during a conversation.

![Distance as Agent tool](../static/img/terraflow-terrabox/figure-3-distance-tool-agent.png)

The screenshot below shows a lightweight Agent workflow using the Distance tool.

![Agent tool result](../static/img/terraflow-terrabox/figure-4-agent-tool-result.png)

## Running Terraflow

Terrabox needs to be running as its own live service for both discovery and
execution -- there's no build-time dependency to install for component
generation anymore:

```bash
export EARTHFLOW_COMPONENTS_ENABLED=1
export TERRALINK_BASE_URL=http://127.0.0.1:8000
export TERRALINK_API_KEY=tlk_live_...

uv run terraflow run --host 0.0.0.0 --port 7860
```

Terrabox should be running separately on the configured `TERRALINK_BASE_URL`.
Without a valid `TERRALINK_API_KEY`, tool discovery is skipped (logged as a
warning) and no Terrabox toolkit categories appear in the sidebar.

## Validation

The focused Earthflow component tests can be run with:

```bash
cd src/lfx
LFX_TEST_ALLOW_TERRAFLOW=1 PYTHONPATH=src python -m pytest tests/unit/interface/test_earthflow_components.py -q
```

Current focused result:

```text
15 passed, 6 warnings
```

The Terrabox schema-loading smoke test confirmed:

- 105 Terrabox specs are loaded by default.
- 105 Langflow component templates are generated.
- `geopatch.train_init`, `geopatch.generate_seg`,
  `geo_perception.bbox_area`, `geo_perception.draw_bboxes`, and
  `geo_perception.ocr_extract` are included.
- Heavy model-service tools such as `geo_perception.vlm_analyze` and
  `geo_perception.sam2_segment` are excluded by default.

## Current Limitations

- Both discovery and execution require a live, reachable Terrabox backend and
  a valid `TERRALINK_API_KEY` -- there's no offline/cached fallback if
  Terrabox is down at the moment the periodic refresh or an on-demand refresh
  runs (the previous tool set just stays in place until the next successful
  fetch).
- The periodic refresh interval (default 10 minutes) means a brand-new
  Terrabox toolkit isn't visible the instant it's added; use
  `POST /api/v1/all/refresh-terrabox-tools` for an immediate pull.
- Heavy perception tools are intentionally excluded by default because the
  current environment does not provide the required Docker/model-service setup.
- `bash`, `ipython`, `github`, and external-search tools are not default-enabled
  because they require additional security, token, or connection handling.
- The `terrabox` package pin in `pyproject.toml`/`src/lfx/pyproject.toml` is no
  longer needed for component generation (discovery is now a plain HTTP call)
  and is a candidate for removal in a follow-up cleanup.

## Next Direction

The next step is not to keep expanding the remaining high-risk tools by default.
The current priority is to connect the existing `langflow-flowgen` MCP and
Claude Skill with Terraflow/Terrabox, so generated Langflow JSON can include
Terrabox tool components and produce Terraflow-ready geospatial workflows.
