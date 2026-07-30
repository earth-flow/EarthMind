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

## Testing

```bash
make unit_tests
make integration_tests
```

## License

[MIT](LICENSE)
