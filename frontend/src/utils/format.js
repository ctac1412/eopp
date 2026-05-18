export function formatMoney(amount) {
  if (amount == null) return "—";
  return `${Math.round(Number(amount)).toLocaleString('ru-RU')} ₽`;
}
