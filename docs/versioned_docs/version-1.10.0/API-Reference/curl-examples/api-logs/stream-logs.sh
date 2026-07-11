curl -X GET \
  "$EARTHMIND_URL/logs-stream" \
  -H "accept: text/event-stream" \
  -H "x-api-key: $EARTHMIND_API_KEY"
