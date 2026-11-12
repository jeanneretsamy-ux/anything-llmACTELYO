// This is a configuration label, not a claim that the server is reachable.
export function llmProviderDisplayName(provider, settings) {
  if (provider?.value !== "generic-openai") return provider?.name;
  try {
    const url = new URL(settings?.GenericOpenAiBasePath);
    if (
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      url.port === "1235" &&
      url.pathname.replace(/\/+$/, "") === "/v1"
    ) return "Actelyo LLM";
  } catch { /* An incomplete configuration keeps its generic label. */ }
  return provider.name;
}
