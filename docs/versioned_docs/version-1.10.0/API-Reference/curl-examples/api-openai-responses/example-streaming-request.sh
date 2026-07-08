curl -X POST \
  "$EARTHMIND_SERVER_URL/api/v1/responses" \
  -H "x-api-key: $EARTHMIND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "$FLOW_ID",
    "input": "Tell me a story about a robot",
    "stream": true
  }'
