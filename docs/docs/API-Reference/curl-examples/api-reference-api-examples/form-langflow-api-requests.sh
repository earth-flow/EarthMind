curl --request POST \
  --url "$TERRAFLOW_SERVER_URL/api/v1/run/$FLOW_ID?stream=false" \
  --header "Content-Type: application/json" \
  --header "x-api-key: $TERRAFLOW_API_KEY" \
  --data '{
  "input_value": "hello world!",
  "output_type": "chat",
  "input_type": "chat",
  "tweaks": {
    "ChatOutput-6zcZt": {
      "should_store_message": true
    }
  }
}'
