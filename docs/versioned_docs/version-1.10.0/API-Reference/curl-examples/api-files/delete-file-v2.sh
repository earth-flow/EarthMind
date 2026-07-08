curl -X DELETE \
  "$EARTHMIND_URL/api/v2/files/$FILE_ID" \
  -H "accept: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY"
