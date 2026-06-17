import { backend } from "../../../../shared/api/backend";

export const PUBLIC_CAPTCHAS_PAGE_SIZE = 100;

export const publicCaptchasService = {
  list: (query = { limit: PUBLIC_CAPTCHAS_PAGE_SIZE, offset: 0 }) =>
    backend.captcha.public.list(query),
  sendSelected: (payload) => backend.captcha.public.sendSelected(payload),
};
