export const customGetHostProtocol = () => {
  const backendUrl = import.meta.env.BACKEND_URL;
  if (backendUrl) {
    const parsed = new URL(backendUrl);
    return {
      host: parsed.host,
      protocol: parsed.protocol,
    };
  }
  return {
    host: window.location.host,
    protocol: window.location.protocol,
  };
};
