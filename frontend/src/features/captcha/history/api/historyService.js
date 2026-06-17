import { apiRequest } from "../../../../shared/api/httpClient";

export const historyService = {
  request: (path, options) => apiRequest(path, options),
  usageLog: () => apiRequest("/usage-log"),
};
