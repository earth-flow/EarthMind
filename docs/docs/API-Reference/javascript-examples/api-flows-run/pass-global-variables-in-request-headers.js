const url = `${process.env.EARTHMIND_SERVER_URL ?? ""}/api/v1/run/${process.env.FLOW_ID ?? ""}`;

const options = {
  method: 'POST',
  headers: {
    "Content-Type": `application/json`,
    "x-api-key": `${process.env.EARTHMIND_API_KEY ?? ""}`,
    "X-EARTHMIND-GLOBAL-VAR-OPENAI_API_KEY": `sk-...`,
    "X-EARTHMIND-GLOBAL-VAR-USER_ID": `user123`,
    "X-EARTHMIND-GLOBAL-VAR-ENVIRONMENT": `production`,
  },
  body: JSON.stringify({
  "input_value": "Tell me about something interesting!",
  "input_type": "chat",
  "output_type": "chat"
}),
};

fetch(url, options)
  .then(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    console.log(text);
  })
  .catch((error) => console.error(error));
