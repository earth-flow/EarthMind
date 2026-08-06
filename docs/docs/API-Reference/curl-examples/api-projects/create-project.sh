curl -X POST \
  "$TERRAFLOW_URL/api/v1/projects/" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY" \
  -d '{
  "name": "new_project_name",
  "description": "string",
  "components_list": [],
  "flows_list": []
}'
