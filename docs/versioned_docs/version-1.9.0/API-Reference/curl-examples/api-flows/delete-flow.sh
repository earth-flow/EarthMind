curl -X DELETE \
  "$EARTHMIND_URL/api/v1/flows/$FLOW_ID" \
  -H "accept: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY"
