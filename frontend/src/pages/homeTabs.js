export const HOME_SIDE_TABS = ["chat", "history", "public-captchas"];

export function normalizeHomeSideTab(tab) {
  return HOME_SIDE_TABS.includes(tab) ? tab : "chat";
}
