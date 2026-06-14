import { apiRequest } from "../../../../shared/api/httpClient";

export const publicCaptchasService = {
  list: () => apiRequest("/public/captchas"),
  sendSelected: (payload) => apiRequest("/public/captchas/send-selected", { method: "POST", json: payload }),
};
