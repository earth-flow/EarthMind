curl -X DELETE \
  "$TERRAFLOW_URL/api/v1/projects/$PROJECT_ID" \
  -H "accept: */*" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
