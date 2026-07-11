curl -X GET \
  "$EARTHMIND_URL/api/v1/monitor/messages" \
  -H "accept: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY"
