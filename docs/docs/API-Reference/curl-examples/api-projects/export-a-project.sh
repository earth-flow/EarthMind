curl -X GET \
  "$TERRAFLOW_URL/api/v1/projects/download/$PROJECT_ID" \
  -H "accept: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY" \
  --output terraflow-project.zip
