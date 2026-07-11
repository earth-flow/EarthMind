curl -X DELETE \
  "$EARTHMIND_URL/api/v1/projects/$PROJECT_ID" \
  -H "accept: */*" \
  -H "x-api-key: $EARTHMIND_API_KEY"
