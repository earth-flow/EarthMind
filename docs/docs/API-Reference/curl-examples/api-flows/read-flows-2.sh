curl -X GET \
  "$TERRAFLOW_URL/api/v1/flows/?remove_example_flows=true&components_only=false&get_all=false&project_id=$PROJECT_ID&header_flows=false&page=1&size=1" \
  -H "accept: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
