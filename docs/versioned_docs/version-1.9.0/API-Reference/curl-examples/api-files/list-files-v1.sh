curl -X GET \
  "$EARTHMIND_URL/api/v1/files/list/$FLOW_ID" \
  -H "accept: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY"
