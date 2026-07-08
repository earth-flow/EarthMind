curl -X GET \
  "$EARTHMIND_URL/api/v1/projects/download/$PROJECT_ID" \
  -H "accept: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY" \
  --output earthmind-project.zip
