import { apiRequest } from "../../../../shared/api/httpClient";

export const operatorWorkbenchService = {
  request: (path, options) => apiRequest(path, options),
  masters: (uuid) => apiRequest(`/operators/${uuid}/masters`),
  sendChat: (payload) => apiRequest("/chat/send", { method: "POST", json: payload }),
  answerDistribution: (payload) => apiRequest("/distribution/answer", { method: "POST", json: payload }),
};
