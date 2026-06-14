import { apiRequest } from "../../../../shared/api/httpClient";

export const historyService = {
  usageLog: (apiKey) => apiRequest(`/usage-log?api_key=${encodeURIComponent(apiKey)}`),
};
