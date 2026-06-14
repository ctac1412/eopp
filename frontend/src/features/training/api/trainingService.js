import { apiRequest } from "../../../shared/api/httpClient";

export const trainingService = {
  request: (path, options) => apiRequest(path, options),
  resolveOperator: (uuid) => apiRequest(`/training/resolve-operator?uuid=${encodeURIComponent(uuid)}`),
  validateKey: (apiKey) => apiRequest(`/validate-key?api_key=${encodeURIComponent(apiKey)}`),
  courses: () => apiRequest("/training/courses"),
  runs: (params) => apiRequest(`/training/runs?${params}`),
  start: (payload) => apiRequest("/training/start", { method: "POST", json: payload }),
  runResults: (runId) => apiRequest(`/training/run/${runId}/results`),
  captcha: (captchaId) => apiRequest(`/training/captcha/${encodeURIComponent(captchaId)}`),
  runStatus: (runId) => apiRequest(`/training/run/${runId}/status`),
  next: (runId) => apiRequest(`/training/run/${runId}/next`),
  complete: (runId) => apiRequest(`/training/run/${runId}/complete`, { method: "POST" }),
  answer: (runId, payload) => apiRequest(`/training/run/${runId}/answer`, { method: "POST", json: payload }),
  cancel: (runId) => apiRequest(`/training/run/${runId}/cancel`, { method: "POST" }),
};
