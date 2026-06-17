import { backend } from "../../../shared/api/backend";

export const authService = {
  login: (payload) => backend.auth.login(payload),
  logout: () => backend.auth.logout(),
  me: () => backend.auth.me(),
  pluginKeys: () => backend.auth.pluginKeys(),
};
