BASE_URL="${EARTHMIND_SERVER_URL:-$EARTHMIND_URL}"

curl -X POST \
  "$BASE_URL/api/v1/responses" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $EARTHMIND_API_KEY" \
  -d @- <<EOF
{
    "model": "$FLOW_ID",
    "input": "Calculate 23 * 15 and show me the result",
    "stream": false,
    "include": ["tool_call.results"]
}
EOF
