const url = `${process.env.TERRAFLOW_SERVER_URL ?? ""}/api/v1/responses`;

const options = {
  method: 'POST',
  headers: {
    "x-api-key": `${process.env.TERRAFLOW_API_KEY ?? ""}`,
    "Content-Type": `application/json`,
    "X-TERRAFLOW-GLOBAL-VAR-OPENAI_API_KEY": `sk-...`,
    "X-TERRAFLOW-GLOBAL-VAR-USER_ID": `user123`,
    "X-TERRAFLOW-GLOBAL-VAR-ENVIRONMENT": `production`,
  },
  body: JSON.stringify({
  "model": "your-flow-id",
  "input": "Hello"
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
