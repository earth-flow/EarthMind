curl -X GET \
  "$TERRAFLOW_URL/api/v1/users/whoami" \
  -H "accept: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
