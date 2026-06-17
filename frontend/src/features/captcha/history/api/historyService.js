import { backend } from "../../../../shared/api/backend";

export const USAGE_LOG_PAGE_LIMIT = 100;

export const historyService = {
  usageLog: (query = { limit: USAGE_LOG_PAGE_LIMIT, offset: 0 }) =>
    backend.captcha.history.usageLog(query),
};
