curl -X POST \
  "$TERRAFLOW_SERVER_URL/api/v1/responses" \
  -H "x-api-key: $TERRAFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-TERRAFLOW-GLOBAL-VAR-OPENAI_API_KEY: sk-..." \
  -H "X-TERRAFLOW-GLOBAL-VAR-USER_ID: user123" \
  -H "X-TERRAFLOW-GLOBAL-VAR-ENVIRONMENT: production" \
  -d '{
    "model": "your-flow-id",
    "input": "Hello"
  }'
