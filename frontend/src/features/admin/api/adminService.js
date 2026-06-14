import { apiRequest } from "../../../shared/api/httpClient";

export function adminHeaders() {
  return { "Content-Type": "application/json" };
}

export function adminHeadersJson() {
  return {};
}

export function adminRequest(path, options = {}) {
  return apiRequest(path, options);
}
