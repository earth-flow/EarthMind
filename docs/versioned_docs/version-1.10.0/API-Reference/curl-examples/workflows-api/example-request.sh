curl -X GET \
  "$EARTHMIND_SERVER_URL/api/v2/workflows?job_id=job_id_1234567890" \
  -H "accept: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY"
