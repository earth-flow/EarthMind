curl -X GET \
  "$TERRAFLOW_URL/logs-stream" \
  -H "accept: text/event-stream" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
