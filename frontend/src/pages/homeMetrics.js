export function buildHomeMetrics({
  connectedOperators = [],
  queue = [],
  sseConnected = false,
}) {
  const activeCaptchas = queue.filter((item) => !item.solved).length;
  const totalOperators = connectedOperators.length;
  const onlineOperators = connectedOperators.filter((operator) => operator.online).length;

  return [
    {
      key: "connection",
      label: "Подключение",
      value: sseConnected ? "Online" : "Offline",
      tone: sseConnected ? "success" : "danger",
    },
    {
      key: "queue",
      label: "Очередь",
      value: activeCaptchas,
      tone: activeCaptchas > 0 ? "warning" : "success",
    },
    {
      key: "operators",
      label: "Операторы",
      value: totalOperators > 0 ? `${onlineOperators} из ${totalOperators}` : "нет",
      tone: onlineOperators > 0 ? "info" : "neutral",
    },
  ];
}
