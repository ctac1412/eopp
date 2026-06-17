import { getServerUrl } from "./background";

function backendUrl(path: string): string {
  return `${getServerUrl()}/api${path}`;
}

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(backendUrl(path), {
    credentials: "include",
    ...init,
  });
}

function jsonRequest(path: string, method: string, body?: unknown): Promise<Response> {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export const backend = {
  mockConfig: {
    get: () => request("/mock-config", { method: "GET" }),
    update: (payload: unknown) => jsonRequest("/mock-config", "POST", payload),
    reset: () => request("/mock-config", { method: "DELETE" }),
  },
};
