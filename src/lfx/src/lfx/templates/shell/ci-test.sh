#!/usr/bin/env bash
# ci-test.sh
#
# PURPOSE
#   Run pytest flow-integration tests against a live EarthMind instance
#   using the earthmind-sdk `flow_runner` fixture.
#
# USAGE
#   chmod +x ci-test.sh
#   ./ci-test.sh
#
# ENVIRONMENT VARIABLES — connection (pick one approach)
#
#   Approach A: direct URL + key (simplest)
#     EARTHMIND_URL        URL of the target EarthMind instance.
#                         e.g. https://staging.earthmind.example.com
#     EARTHMIND_API_KEY    API key for that instance.
#
#   Approach B: named environment from a TOML config
#     EARTHMIND_ENV                 Name of the environment block in the TOML.
#                                  e.g. staging
#     EARTHMIND_ENVIRONMENTS_FILE   Path to the environments TOML.
#                                  Default: earthmind-environments.toml
#     <api_key_env var>            The env var named in api_key_env inside the
#                                  TOML block, e.g. EARTHMIND_STAGING_API_KEY.
#
#   The TOML format (see also ci-push.sh):
#
#     [environments.staging]
#     url        = "https://staging.earthmind.example.com"
#     api_key_env = "EARTHMIND_STAGING_API_KEY"
#
# ENVIRONMENT VARIABLES — behaviour
#   TESTS_DIR        Directory containing test files.  Default: tests/
#   PYTEST_MARKERS   Markers to pass to -m.  Default: integration
#   PYTEST_ARGS      Extra arguments forwarded verbatim to pytest.
#   SDK_VERSION      earthmind-sdk PEP 508 version specifier suffix appended
#                    directly to the package name, e.g. ">=0.4,<1" or "==1.2.3".
#                    Default: installs latest.
#
# SKIPPING
#   When neither EARTHMIND_URL nor EARTHMIND_ENV is set the tests auto-skip
#   (the flow_runner fixture detects no connection).  This means the script
#   exits 0 even when run on a branch that lacks the necessary secrets.
#
# EXIT CODES
#   0  All tests passed (or skipped due to missing connection)
#   1  One or more tests failed
#
# INTEGRATIONS
#   Jenkins:          sh 'ci-test.sh'
#   CircleCI:         - run: bash ci-test.sh
#   Bitbucket:        - bash ci-test.sh
#   Azure Pipelines:  - script: bash ci-test.sh

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────── #

TESTS_DIR="${TESTS_DIR:-tests/}"
PYTEST_MARKERS="${PYTEST_MARKERS:-integration}"
PYTEST_ARGS="${PYTEST_ARGS:-}"
SDK_VERSION="${SDK_VERSION:-}"
EARTHMIND_ENV="${EARTHMIND_ENV:-}"
EARTHMIND_ENVIRONMENTS_FILE="${EARTHMIND_ENVIRONMENTS_FILE:-earthmind-environments.toml}"

# ── Install dependencies ───────────────────────────────────────────────────── #

# Normalise SDK_VERSION: if it looks like a bare version (starts with a digit),
# prepend "==" so the pip specifier is valid.
if [[ -n "${SDK_VERSION}" && "${SDK_VERSION}" =~ ^[0-9] ]]; then
  SDK_VERSION="==${SDK_VERSION}"
fi

echo "==> Installing earthmind-sdk[testing] and pytest ..."
pip install --quiet \
  "earthmind-sdk[testing]${SDK_VERSION}" \
  pytest

# ── Build environments file if using Approach B ───────────────────────────── #

if [[ -n "${EARTHMIND_ENV}" && ! -f "${EARTHMIND_ENVIRONMENTS_FILE}" ]]; then
  # Derive variable names from the env name (uppercased, hyphens → underscores)
  ENV_UPPER="${EARTHMIND_ENV^^}"
  ENV_UPPER="${ENV_UPPER//-/_}"
  URL_VAR="EARTHMIND_${ENV_UPPER}_URL"
  KEY_VAR="EARTHMIND_${ENV_UPPER}_API_KEY"

  echo "==> Writing ${EARTHMIND_ENVIRONMENTS_FILE} for environment '${EARTHMIND_ENV}' ..."
  printf '[environments.%s]\nurl = "%s"\napi_key_env = "%s"\n' \
    "${EARTHMIND_ENV}" \
    "${!URL_VAR:-}" \
    "${KEY_VAR}" \
    > "${EARTHMIND_ENVIRONMENTS_FILE}"
fi

# ── Run tests ─────────────────────────────────────────────────────────────── #

# Build pytest command
PYTEST_CMD=(pytest "${TESTS_DIR}" -v --tb=short)

if [[ -n "${PYTEST_MARKERS}" ]]; then
  PYTEST_CMD+=(-m "${PYTEST_MARKERS}")
fi

if [[ -n "${EARTHMIND_ENV}" ]]; then
  PYTEST_CMD+=(--earthmind-env "${EARTHMIND_ENV}")
  export EARTHMIND_ENVIRONMENTS_FILE
elif [[ -n "${EARTHMIND_URL:-}" ]]; then
  PYTEST_CMD+=(--earthmind-url "${EARTHMIND_URL}")
  [[ -n "${EARTHMIND_API_KEY:-}" ]] && PYTEST_CMD+=(--earthmind-api-key "${EARTHMIND_API_KEY}")
fi

# Append any extra user-supplied args
# shellcheck disable=SC2206
[[ -n "${PYTEST_ARGS}" ]] && PYTEST_CMD+=(${PYTEST_ARGS})

echo "==> Running: ${PYTEST_CMD[*]}"
"${PYTEST_CMD[@]}"
