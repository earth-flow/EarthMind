curl -X POST \
  "$EARTHMIND_SERVER_URL/api/v1/responses" \
  -H "x-api-key: $EARTHMIND_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-EARTHMIND-GLOBAL-VAR-OPENAI_API_KEY: sk-..." \
  -H "X-EARTHMIND-GLOBAL-VAR-USER_ID: user123" \
  -H "X-EARTHMIND-GLOBAL-VAR-ENVIRONMENT: production" \
  -d '{
    "model": "your-flow-id",
    "input": "Hello"
  }'
