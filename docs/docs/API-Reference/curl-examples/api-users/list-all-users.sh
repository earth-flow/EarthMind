curl -X GET \
  "$TERRAFLOW_URL/api/v1/users/?skip=0&limit=10" \
  -H "accept: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
