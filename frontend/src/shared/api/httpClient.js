import { ApiError } from "./apiError";
import { API_BASE_URL } from "./endpoints";

function buildUrl(path, query) {
  const url = path.startsWith("http") ? new URL(path) : new URL(`${API_BASE_URL}${path}`, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
  }
  return path.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
}

export function jsonHeaders(headers = {}) {
  return { "Content-Type": "application/json", ...headers };
}

export async function apiRequest(path, options = {}) {
  const { query, json, headers, ...fetchOptions } = options;
  const request = {
    ...fetchOptions,
    headers: json !== undefined ? jsonHeaders(headers) : headers,
  };
  if (json !== undefined) {
    request.body = JSON.stringify(json);
  }
  try {
    return await fetch(buildUrl(path, query), request);
  } catch (error) {
    throw new ApiError(error.message, { url: path });
  }
}

export const httpClient = {
  get: (path, options) => apiRequest(path, { ...options, method: "GET" }),
  post: (path, options) => apiRequest(path, { ...options, method: "POST" }),
  put: (path, options) => apiRequest(path, { ...options, method: "PUT" }),
  patch: (path, options) => apiRequest(path, { ...options, method: "PATCH" }),
  delete: (path, options) => apiRequest(path, { ...options, method: "DELETE" }),
};
