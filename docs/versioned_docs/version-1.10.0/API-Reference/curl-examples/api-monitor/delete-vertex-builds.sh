curl -X DELETE \
  "$EARTHMIND_URL/api/v1/monitor/builds?flow_id=$FLOW_ID" \
  -H "accept: */*" \
  -H "x-api-key: $EARTHMIND_API_KEY"
