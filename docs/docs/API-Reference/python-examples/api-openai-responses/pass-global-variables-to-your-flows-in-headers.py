import os

import requests

url = f"{os.getenv('TERRAFLOW_SERVER_URL', '')}/api/v1/responses"

headers = {
    "x-api-key": f"{os.getenv('TERRAFLOW_API_KEY', '')}",
    "Content-Type": "application/json",
    "X-TERRAFLOW-GLOBAL-VAR-OPENAI_API_KEY": "sk-...",
    "X-TERRAFLOW-GLOBAL-VAR-USER_ID": "user123",
    "X-TERRAFLOW-GLOBAL-VAR-ENVIRONMENT": "production",
}

payload = {"model": "your-flow-id", "input": "Hello"}

response = requests.request("POST", url, headers=headers, json=payload)
response.raise_for_status()

print(response.text)
