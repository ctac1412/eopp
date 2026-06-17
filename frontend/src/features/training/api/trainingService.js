import { backend } from "../../../shared/api/backend";

export const trainingService = {
  resolveOperator: (uuid) => backend.training.resolveOperator(uuid),
  validateKey: () => backend.training.validateKey(),
  courses: () => backend.training.courses(),
  runs: (params) => backend.training.runs(params),
  start: (payload) => backend.training.start(payload),
  runResults: (runId) => backend.training.runResults(runId),
  captcha: (captchaId) => backend.training.captcha(captchaId),
  runStatus: (runId) => backend.training.runStatus(runId),
  next: (runId) => backend.training.next(runId),
  complete: (runId) => backend.training.complete(runId),
  answer: (runId, payload) => backend.training.answer(runId, payload),
  cancel: (runId) => backend.training.cancel(runId),
};
