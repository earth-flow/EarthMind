curl -X DELETE \
  "$TERRAFLOW_URL/api/v2/files/$FILE_ID" \
  -H "accept: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
