curl -X GET \
  "$EARTHMIND_URL/api/v1/users/whoami" \
  -H "accept: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY"
