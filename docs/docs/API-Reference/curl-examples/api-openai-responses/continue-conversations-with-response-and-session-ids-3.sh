BASE_URL="${EARTHMIND_SERVER_URL:-$EARTHMIND_URL}"

curl -X POST \
  "$BASE_URL/api/v1/responses" \
  -H "x-api-key: $EARTHMIND_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "model": "$FLOW_ID",
  "input": "What's my name?",
  "previous_response_id": "session-alice-1756839048"
}
EOF
