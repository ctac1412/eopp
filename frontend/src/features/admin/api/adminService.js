import { backend } from "../../../shared/api/backend.js";

export function adminHeaders() {
  return { "Content-Type": "application/json" };
}

export function adminHeadersJson() {
  return {};
}

export function adminRequest(path, options = {}) {
  return backend.admin.request(path, options);
}

export const adminService = backend.admin;
