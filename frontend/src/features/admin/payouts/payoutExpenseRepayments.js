export function expenseRemainingAmount(expense) {
  const amount = Number(expense?.amount) || 0;
  const allocated = Number(expense?.allocation?.allocated_amount) || 0;
  return Math.max(amount - allocated, 0);
}

export function normalizeRepaymentAmount(value, expense) {
  const amount = Number(value) || 0;
  if (amount <= 0) return 0;
  return Math.min(amount, expenseRemainingAmount(expense));
}

export function expenseRepaymentsFromForm(form) {
  return Object.entries(form?.expense_repayments || {})
    .map(([expenseId, amount]) => ({
      expense_id: Number(expenseId),
      amount: Number(amount) || 0,
    }))
    .filter((item) => item.expense_id && item.amount > 0);
}
