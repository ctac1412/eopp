import { apiRequest } from "../../../shared/api/httpClient";

export const authService = {
  request: (path, options) => apiRequest(path, options),
  login: (payload) => apiRequest("/auth/login", { method: "POST", json: payload }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  me: () => apiRequest("/auth/me"),
  pluginKeys: () => apiRequest("/auth/plugin-keys"),
};
