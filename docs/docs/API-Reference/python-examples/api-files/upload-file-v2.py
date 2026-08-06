import os

import requests

url = f"{os.getenv('TERRAFLOW_URL', '')}/api/v1/users/whoami"

headers = {
    "accept": "application/json",
    "x-api-key": f"{os.getenv('TERRAFLOW_API_KEY', '')}",
}

response = requests.request("GET", url, headers=headers)
response.raise_for_status()

print(response.text)
