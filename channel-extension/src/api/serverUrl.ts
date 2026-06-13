export function resolveServerUrl(buildServerUrl: string, pageOrigin = window.location.origin): string {
  const normalizedBuildUrl = normalizeServerUrl(buildServerUrl || "http://localhost:8765");
  const parsedPageOrigin = safeUrl(pageOrigin);
  if (!parsedPageOrigin) {
    return normalizedBuildUrl;
  }

  const host = parsedPageOrigin.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return parsedPageOrigin.origin;
  }

  return normalizedBuildUrl;
}

function normalizeServerUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
