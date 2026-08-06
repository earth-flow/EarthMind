curl -X POST \
  "$TERRAFLOW_SERVER_URL/api/v1/webhook/$FLOW_ID" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY" \
  -d '{"data": "example-data"}'
