# CI/CD Pipeline Templates

Ready-to-use workflow files for the Flow DevOps Toolkit.
Copy the files you need into your project's CI configuration.

## GitHub Actions

| File | Trigger | Secrets needed |
|------|---------|----------------|
| [`github-actions/terraflow-validate.yml`](github-actions/terraflow-validate.yml) | PR touching `flows/**/*.json` | None |
| [`github-actions/terraflow-test.yml`](github-actions/terraflow-test.yml) | PR touching flows or tests | `TERRAFLOW_STAGING_API_KEY` |
| [`github-actions/terraflow-push.yml`](github-actions/terraflow-push.yml) | Push to `main` touching flows | `TERRAFLOW_PROD_API_KEY` |

### Quick start

```bash
mkdir -p .github/workflows
cp github-actions/terraflow-validate.yml \
   github-actions/terraflow-test.yml \
   github-actions/terraflow-push.yml \
   .github/workflows/
```

Configure these in **Settings → Environments**:

**`staging`** environment (used by `terraflow-test.yml`):
| Name | Type | Value |
|------|------|-------|
| `TERRAFLOW_STAGING_URL` | Variable | `https://staging.terraflow.example.com` |
| `TERRAFLOW_STAGING_API_KEY` | Secret | your staging API key |

**`production`** environment (used by `terraflow-push.yml`):
| Name | Type | Value |
|------|------|-------|
| `TERRAFLOW_PROD_URL` | Variable | `https://terraflow.example.com` |
| `TERRAFLOW_PROD_API_KEY` | Secret | your production API key |
| `TERRAFLOW_PROJECT_NAME` | Variable | `Production Flows` *(optional)* |

Add **Required reviewers** to the `production` environment to gate every deploy
behind a manual approval step.

---

## GitLab CI

| File | Description |
|------|-------------|
| [`gitlab-ci/terraflow.yml`](gitlab-ci/terraflow.yml) | Three-stage template: validate → test → deploy |

### Quick start

```bash
mkdir -p .gitlab/ci
cp gitlab-ci/terraflow.yml .gitlab/ci/
```

Add to your `.gitlab-ci.yml`:

```yaml
include:
  - local: .gitlab/ci/terraflow.yml
```

Configure these in **Settings → CI/CD → Variables**:

| Variable | Protected | Masked | Description |
|----------|-----------|--------|-------------|
| `TERRAFLOW_STAGING_URL` | ✓ | ✗ | Staging instance URL |
| `TERRAFLOW_STAGING_API_KEY` | ✓ | ✓ | Staging API key |
| `TERRAFLOW_PROD_URL` | ✓ | ✗ | Production instance URL |
| `TERRAFLOW_PROD_API_KEY` | ✓ | ✓ | Production API key |
| `TERRAFLOW_PROJECT_NAME` | ✗ | ✗ | Project folder name *(optional)* |

---

## Shell scripts (`ci/`)

The `shell/` templates (`ci-validate.sh`, `ci-test.sh`, `ci-push.sh`) work with
any CI system (Jenkins, CircleCI, Bitbucket Pipelines, Azure Pipelines, etc.).
They are copied to `ci/` by `lfx init`.

### Environment variables

#### `ci-validate.sh`

| Variable | Default | Description |
|----------|---------|-------------|
| `FLOWS_DIR` | `flows/` | Directory containing flow JSON files |
| `VALIDATE_LEVEL` | `4` | Validation depth (1–4) |
| `VALIDATE_FORMAT` | `text` | Output format: `text` or `json` |
| `LFX_VERSION` | *(latest)* | PEP 508 version specifier for `lfx`, e.g. `>=0.4,<1` or `==1.2.3` |

#### `ci-test.sh`

| Variable | Default | Description |
|----------|---------|-------------|
| `TERRAFLOW_URL` | — | URL of target Terraflow instance (Approach A) |
| `TERRAFLOW_API_KEY` | — | API key for target instance (Approach A) |
| `TERRAFLOW_ENV` | — | Environment name from config (Approach B) |
| `TERRAFLOW_ENVIRONMENTS_FILE` | `terraflow-environments.toml` | Path to environments config (Approach B) |
| `TESTS_DIR` | `tests/` | Directory containing test files |
| `PYTEST_MARKERS` | `integration` | Markers passed to `pytest -m` |
| `PYTEST_ARGS` | — | Extra arguments forwarded verbatim to pytest |
| `SDK_VERSION` | *(latest)* | PEP 508 version specifier for `terraflow-sdk` |

#### `ci-push.sh`

| Variable | Default | Description |
|----------|---------|-------------|
| `TERRAFLOW_URL` | — | URL of target Terraflow instance (Approach A) |
| `TERRAFLOW_API_KEY` | — | API key for target instance (Approach A) |
| `TERRAFLOW_ENV` | — | Environment name from config (Approach B) |
| `TERRAFLOW_ENVIRONMENTS_FILE` | `terraflow-environments.toml` | Path to environments config (Approach B) |
| `FLOWS_DIR` | `flows/` | Directory containing flow JSON files |
| `TERRAFLOW_PROJECT` | — | Project (folder) name on the remote instance |
| `TERRAFLOW_PROJECT_ID` | — | Project UUID (takes precedence over `TERRAFLOW_PROJECT`) |
| `DRY_RUN` | `false` | Set to `true` to preview without making changes |
| `LFX_VERSION` | *(latest)* | PEP 508 version specifier for `lfx` |

---

## How it all fits together

```
PR opened
  │
  ├── terraflow-validate  ──── lfx validate flows/ --level 4
  │                           ↳ blocks merge if any flow is malformed
  │
  └── terraflow-test  ──────── pytest tests/ --terraflow-env staging
                              ↳ skips gracefully if staging is unavailable

Merge to main
  │
  └── terraflow-push  ──────── lfx push --dir flows/ --env production
                              ↳ upserts every flow by stable ID
                              ↳ idempotent: safe to re-run
```

## Writing integration tests

Install the testing extra:

```bash
pip install "terraflow-sdk[testing]"
```

Create `tests/test_flows.py`:

```python
def test_rag_flow(flow_runner):
    response = flow_runner("rag-endpoint", "What is Terraflow?")
    assert "Terraflow" in response.first_text_output()

async def test_async_flow(async_flow_runner):
    response = await async_flow_runner("my-endpoint", "Hello!")
    assert response.first_text_output() is not None
```

Run locally against staging:

```bash
TERRAFLOW_URL=https://staging.terraflow.example.com \
TERRAFLOW_API_KEY=<key> \
pytest tests/ -m integration
```
