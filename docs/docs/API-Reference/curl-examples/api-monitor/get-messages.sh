curl -X GET \
  "$TERRAFLOW_URL/api/v1/monitor/messages" \
  -H "accept: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
