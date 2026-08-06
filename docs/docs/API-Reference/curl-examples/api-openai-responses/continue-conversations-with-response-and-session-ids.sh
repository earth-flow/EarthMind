BASE_URL="${TERRAFLOW_SERVER_URL:-$TERRAFLOW_URL}"

curl -X POST \
  "$BASE_URL/api/v1/responses" \
  -H "x-api-key: $TERRAFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "model": "$FLOW_ID",
  "input": "Hello, my name is Alice"
}
EOF
