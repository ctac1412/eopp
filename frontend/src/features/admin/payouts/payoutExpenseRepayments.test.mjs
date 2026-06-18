import assert from "node:assert/strict";
import test from "node:test";

import {
  expenseRemainingAmount,
  expenseRepaymentsFromForm,
  normalizeRepaymentAmount,
} from "./payoutExpenseRepayments.js";

test("payout expense repayments clamp remaining amounts and serialize form values", () => {
const expense = {
  id: 7,
  amount: 10000,
  allocation: {
    allocated_amount: 4000,
  },
};

assert.equal(expenseRemainingAmount(expense), 6000);
assert.equal(normalizeRepaymentAmount(9000, expense), 6000);
assert.equal(normalizeRepaymentAmount(-10, expense), 0);
assert.deepEqual(
  expenseRepaymentsFromForm({
    expense_repayments: {
      7: 2500,
      8: 0,
      9: "",
    },
  }),
  [{ expense_id: 7, amount: 2500 }],
);
});
