import os

import requests

url = f"{os.getenv('EARTHMIND_SERVER_URL', '')}/api/v1/responses"

headers = {
    "x-api-key": f"{os.getenv('EARTHMIND_API_KEY', '')}",
    "Content-Type": "application/json",
    "X-EARTHMIND-GLOBAL-VAR-OPENAI_API_KEY": "sk-...",
    "X-EARTHMIND-GLOBAL-VAR-USER_ID": "user123",
    "X-EARTHMIND-GLOBAL-VAR-ENVIRONMENT": "production",
}

payload = {"model": "your-flow-id", "input": "Hello"}

response = requests.request("POST", url, headers=headers, json=payload)
response.raise_for_status()

print(response.text)
