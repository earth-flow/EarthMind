# EarthMind

EarthMind is a visual AI workflow builder for composing LLM-powered applications, built on top of [Langflow](https://github.com/langflow-ai/langflow). It provides a drag-and-drop canvas for wiring together LLMs, agents, RAG pipelines, and other components into runnable flows, with a Python backend and a React/TypeScript frontend.

## Project layout

- `src/backend` — FastAPI backend (`langflow`/`lfx` engine plus EarthMind-specific extensions)
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

EarthMind ships with a filtered, remote-sensing-focused component catalog and a set
of generated Langflow components ("earthflow tools") backed by
[Terrabox](https://github.com/earth-flow/terrabox), a separately deployed geospatial
tool backend. See [docs/docs/earthmind-terrabox-tools.md](docs/docs/earthmind-terrabox-tools.md)
for the full picture; the short version:

- **Build-time:** `terrabox[geo]` is a normal pinned dependency (`[tool.uv.sources]`
  in `pyproject.toml`, tracking a Terrabox release tag). `uv sync` installs it like
  any other package — no separate Terrabox checkout or `PYTHONPATH` setup needed.
  At startup, EarthMind imports Terrabox's tool registry and generates one Langflow
  component per registered tool (105 by default).
- **Runtime:** each generated component calls a *live* Terrabox instance's REST API
  (`TERRALINK_BASE_URL`, default `http://localhost:8000`) to actually execute the
  tool, using a Terrabox API key. Terrabox must be running separately — it owns its
  own database, auth, and API keys independently of EarthMind.

Minimal setup:

```bash
# Terrabox, in its own environment
cd terrabox && uv venv && uv pip install -e ".[geo]" && python scripts/init_db.py
uvicorn terrabox.main:app --app-dir src --host 0.0.0.0 --port 8000

# EarthMind
export EARTHFLOW_COMPONENTS_ENABLED=1
export TERRALINK_BASE_URL=http://127.0.0.1:8000
uv run earthmind run --host 0.0.0.0 --port 7860
```

Picking up new/changed Terrabox tools means cutting a new Terrabox release tag and
bumping the pin in `pyproject.toml` (`uv lock` afterwards) — the same workflow as
updating any other dependency.

## Testing

```bash
make unit_tests
make integration_tests
```

## License

[MIT](LICENSE)
