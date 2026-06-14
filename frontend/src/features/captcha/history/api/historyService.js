import { apiRequest } from "../../../../shared/api/httpClient";

export const historyService = {
  request: (path, options) => apiRequest(path, options),
  usageLog: (apiKey) => apiRequest(`/usage-log?api_key=${encodeURIComponent(apiKey)}`),
};
