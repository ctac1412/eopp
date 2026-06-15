export const FINANCE_KIND_LABELS = {
  customer_income: "Доход клиента",
  executor_salary: "Исполнитель",
  operator_salary: "Оператор",
  invoice_commission: "Комиссия",
  invoice_tax: "Налог",
  director_profit: "Прибыль директора",
  expense_repayment: "Возврат расхода",
  manual_adjustment: "Корректировка",
};

export const EDIT_STATE_LABELS = {
  open: "Открыта",
  locked: "Закрыта",
  paid: "Оплачена",
};

export function financeKindLabel(kind) {
  return FINANCE_KIND_LABELS[kind] || kind || "—";
}

export function editStateLabel(state) {
  return EDIT_STATE_LABELS[state] || state || "—";
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesFinanceSearch(row, query) {
  const needle = normalizeSearchValue(query);
  if (!needle) {
    return true;
  }
  const values = [
    row?.id,
    row?.company_id,
    row?.usage_log_id,
    row?.invoice_id,
    row?.payout_id,
    row?.profit_lot_id,
    row?.kind,
    financeKindLabel(row?.kind),
    row?.edit_state,
    editStateLabel(row?.edit_state),
    row?.comment,
    row?.source,
    row?.source_key,
    row?.company,
    row?.company_name,
    row?.invoice_number,
    row?.user,
    row?.user_name,
    row?.name,
  ];
  return values.some((value) => normalizeSearchValue(value).includes(needle));
}
