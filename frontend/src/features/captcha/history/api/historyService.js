import { backend } from "../../../../shared/api/backend";

export const historyService = {
  usageLog: (query) => backend.captcha.history.usageLog(query),
};
