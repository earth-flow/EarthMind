curl -X DELETE \
  "$TERRAFLOW_URL/api/v1/monitor/builds?flow_id=$FLOW_ID" \
  -H "accept: */*" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
