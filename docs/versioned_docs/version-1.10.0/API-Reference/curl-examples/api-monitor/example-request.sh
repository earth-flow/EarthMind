export EARTHMIND_SERVER_URL="http://localhost:7860"
export EARTHMIND_API_KEY="YOUR_EARTHMIND_API_KEY"
export FLOW_ID="YOUR_FLOW_ID"

curl -s "$EARTHMIND_SERVER_URL/api/v1/monitor/traces?flow_id=$FLOW_ID&page=1&size=50" \
  -H "accept: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY" \
  | jq .
