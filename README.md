# Terraflow

Terraflow is a visual AI workflow builder for composing LLM-powered applications, built on top of [Langflow](https://github.com/langflow-ai/langflow). It provides a drag-and-drop canvas for wiring together LLMs, agents, RAG pipelines, and other components into runnable flows, with a Python backend and a React/TypeScript frontend.

## Project layout

- `src/backend` — FastAPI backend (`langflow`/`lfx` engine plus Terraflow-specific extensions)
- `src/frontend` — React/TypeScript UI
- `src/lfx` — core flow-execution engine
- `src/bundles` — bundled integrations/components
- `docs` — Docusaurus documentation site
- `deploy`, `docker`, `docker_example` — deployment and containerization assets

## Getting started

```bash
make init          # install backend + frontend dependencies
make backend        # run the backend
make frontend        # run the frontend dev server
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup, testing, and contribution workflows, and [DESIGN.md](DESIGN.md) for UI/design conventions.

## Terrabox integration

Terraflow ships with a filtered, remote-sensing-focused component catalog and a set
of generated Langflow components ("earthflow tools") backed by
[Terrabox](https://github.com/earth-flow/terrabox), a separately deployed geospatial
tool backend. See [docs/docs/terraflow-terrabox-tools.md](docs/docs/terraflow-terrabox-tools.md)
for the full picture; the short version:

- **Discovery:** Terraflow fetches Terrabox's tool catalog live over HTTP
  (`GET {TERRALINK_BASE_URL}/v1/sdk/toolkits`) and generates one Langflow
  component per tool (105 by default). No build-time Terrabox dependency is
  involved — a toolkit or tool Terrabox adds shows up automatically, refreshed
  on a background interval or on demand (see the docs page).
- **Runtime:** each generated component calls the *live* Terrabox instance's
  REST API (`TERRALINK_BASE_URL`, default `http://localhost:8000`) to actually
  execute the tool. Both discovery and execution authenticate with the same
  Terrabox API key (`TERRALINK_API_KEY`). Terrabox must be running separately
  — it owns its own database, auth, and API keys independently of Terraflow.

Minimal setup:

```bash
# Terrabox, in its own environment
cd terrabox && uv venv && uv pip install -e ".[geo]" && python scripts/init_db.py
uvicorn terrabox.main:app --app-dir src --host 0.0.0.0 --port 8000

# Terraflow
export EARTHFLOW_COMPONENTS_ENABLED=1
export TERRALINK_BASE_URL=http://127.0.0.1:8000
export TERRALINK_API_KEY=tlk_live_...
uv run terraflow run --host 0.0.0.0 --port 7860
```

New/changed Terrabox tools are picked up automatically — no Terraflow
dependency bump needed. See
[Automatic Toolkit Discovery](docs/docs/terraflow-terrabox-tools.md#automatic-toolkit-discovery)
for the refresh interval and the on-demand refresh endpoint.

## Testing

```bash
make unit_tests
make integration_tests
```

## License

[MIT](LICENSE)
