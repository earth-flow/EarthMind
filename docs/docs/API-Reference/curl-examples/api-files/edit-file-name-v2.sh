curl -X PUT \
  "$TERRAFLOW_URL/api/v2/files/$FILE_ID?name=new_file_name" \
  -H "accept: application/json" \
  -H "x-api-key: $TERRAFLOW_API_KEY"
