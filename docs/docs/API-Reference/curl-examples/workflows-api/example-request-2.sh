curl -X POST \
  "$EARTHMIND_SERVER_URL/api/v2/workflows/stop" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY" \
  -d '{
    "job_id": "job_id_1234567890"
  }'
