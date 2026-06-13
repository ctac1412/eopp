export function getCaptchaGridStatus({ active, unsolvedCount = 0 }) {
  if (!active) {
    return {
      status: "waiting",
      title: "Ожидание запросов",
      subtitle: "Нет активной капчи",
      badges: [`В очереди: ${unsolvedCount}`],
    };
  }

  return {
    status: "active",
    title: `Капча ${active.id}`,
    subtitle: active.captchaType === 1 ? "Клик-капча" : "Пазл",
    badges: [`В очереди: ${unsolvedCount}`],
  };
}

export function getIdleCaptchaSkeletonMode() {
  return "icon-click";
}
