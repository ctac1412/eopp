import { backend } from "../../../../shared/api/backend";

export const publicCaptchasService = {
  list: () => backend.captcha.public.list(),
  sendSelected: (payload) => backend.captcha.public.sendSelected(payload),
};
