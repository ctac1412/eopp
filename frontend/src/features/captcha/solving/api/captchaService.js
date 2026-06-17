import { backend } from "../../../../shared/api/backend";

export const captchaService = {
  solve: (payload) => backend.captcha.solve(payload),
  answerDistribution: (payload) => backend.captcha.answerDistribution(payload),
  validateKey: () => backend.captcha.validateKey(),
  apiKeys: (query) => backend.captcha.apiKeys(query),
  trainingCourses: () => backend.captcha.trainingCourses(),
  triggerTest: (payload) => backend.captcha.triggerTest(payload),
  me: () => backend.auth.me(),
  pluginKeys: () => backend.auth.pluginKeys(),
  logout: () => backend.auth.logout(),
};
