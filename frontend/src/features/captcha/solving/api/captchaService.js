import { apiRequest } from "../../../../shared/api/httpClient";

export const captchaService = {
  request: (path, options) => apiRequest(path, options),
  solve: (payload) => apiRequest("/solve", { method: "POST", json: payload }),
  answerDistribution: (payload) => apiRequest("/distribution/answer", { method: "POST", json: payload }),
  validateKey: (apiKey) => apiRequest(`/validate-key?api_key=${encodeURIComponent(apiKey)}`),
  apiKeys: () => apiRequest("/api-keys"),
  trainingCourses: () => apiRequest("/training/courses"),
  triggerTest: (payload) => apiRequest("/trigger-test", { method: "POST", json: payload }),
};
