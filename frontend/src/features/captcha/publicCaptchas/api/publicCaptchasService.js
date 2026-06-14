import { apiRequest } from "../../../../shared/api/httpClient";

export const publicCaptchasService = {
  request: (path, options) => apiRequest(path, options),
  list: () => apiRequest("/public/captchas"),
  sendSelected: (payload) => apiRequest("/public/captchas/send-selected", { method: "POST", json: payload }),
};
