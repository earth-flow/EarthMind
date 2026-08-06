const url = `${process.env.TERRAFLOW_URL ?? ""}/api/v1/monitor/messages/session/different_session_id_2`;

const options = {
  method: 'DELETE',
  headers: {
    "accept": `*/*`,
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
