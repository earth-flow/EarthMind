const url = `${process.env.TERRAFLOW_SERVER_URL ?? ""}/api/v1/all`;

const options = {
  method: 'GET',
  headers: {
    "accept": `application/json`,
    "x-api-key": `${process.env.TERRAFLOW_API_KEY ?? ""}`,
  },
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
