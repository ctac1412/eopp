import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Checkbox, InputNumber, Modal, Spin, Table } from "antd";
import { Button, DataTable, SegmentedControl, SelectInput, TextInput } from "../../../ui";
import { adminHeadersJson, adminRequest } from "../shared/adminClient";
import { editStateLabel, financeKindLabel, formatDateTime } from "../finance/financeFormat";
import {
  expenseRemainingAmount,
  expenseRepaymentsFromForm,
  normalizeRepaymentAmount,
} from "./payoutExpenseRepayments";

const PAYOUT_FINANCE_ENTRIES_LIMIT = 500;

function formatMoney(value) {
  return `${(Number(value) || 0).toLocaleString("ru-RU")} ₽`;
}

function allocationLabel(allocation) {
  if (!allocation || allocation.status === "unallocated") return null;
  return allocation.status === "fully_allocated" ? "Распределен" : `${allocation.allocated_pct}%`;
}

export function PayoutModal({
  show,
  form,
  setForm,
  onSubmit,
  onClose,
  preview,
  users = [],
  availableInvoices = [],
  availableExpenses = [],
  onPreview,
  previewLoading,
  adminToken,
}) {
  const timerRef = useRef(null);
  const [previewTab, setPreviewTab] = useState("summary");
  const [financeEntries, setFinanceEntries] = useState([]);
  const [financeEntriesLoading, setFinanceEntriesLoading] = useState(false);
  const [financeEntriesError, setFinanceEntriesError] = useState("");

  const triggerPreview = useCallback(
    (invoiceIds, expenseIds, splits, expenseRepayments) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onPreview?.(invoiceIds, expenseIds, splits, expenseRepayments);
      }, 400);
    },
    [onPreview],
  );

  useEffect(() => {
    if (!show) return undefined;
    const splits = (form.splits || []).filter((split) => split.user_id != null);
    const expenseRepayments = expenseRepaymentsFromForm({ expense_repayments: form.expense_repayments });
    if ((form.invoice_ids || []).length > 0 || (form.expense_ids || []).length > 0 || expenseRepayments.length > 0 || splits.length > 0) {
      triggerPreview(form.invoice_ids || [], form.expense_ids || [], splits, expenseRepayments);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, form.invoice_ids, form.expense_ids, form.expense_repayments, form.splits, triggerPreview]);

  useEffect(() => {
    if (!show || !adminToken) {
      setFinanceEntries([]);
      return undefined;
    }
    const ids = form.invoice_ids || [];
    if (!form.id && ids.length === 0) {
      setFinanceEntries([]);
      return undefined;
    }
    let cancelled = false;
    setFinanceEntriesLoading(true);
    setFinanceEntriesError("");
    const requests = form.id
      ? [adminRequest(`/admin/finance-entries?payout_id=${form.id}&limit=${PAYOUT_FINANCE_ENTRIES_LIMIT}&offset=0`, { headers: adminHeadersJson(adminToken) })]
      : ids.map((invoiceId) =>
          adminRequest(`/admin/finance-entries?invoice_id=${invoiceId}&limit=${PAYOUT_FINANCE_ENTRIES_LIMIT}&offset=0`, { headers: adminHeadersJson(adminToken) }),
        );
    Promise.all(requests)
      .then(async (responses) => {
        const rows = [];
        for (const response of responses) {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (Array.isArray(data)) rows.push(...data);
        }
        if (!cancelled) {
          const seen = new Set();
          setFinanceEntries(rows.filter((row) => {
            if (seen.has(row.id)) return false;
            seen.add(row.id);
            return true;
          }));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFinanceEntries([]);
          setFinanceEntriesError(err.message || "Не удалось загрузить проводки");
        }
      })
      .finally(() => {
        if (!cancelled) setFinanceEntriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [show, adminToken, form.id, form.invoice_ids]);

  const splits = form.splits || [];
  const invoiceIds = form.invoice_ids || [];
  const expenseIds = form.expense_ids || [];
  const expenseRepayments = form.expense_repayments || {};
  const expenseRepaymentAmount = (expenseId) => Number(expenseRepayments[expenseId]) || 0;
  const allInvoiceIds = availableInvoices.map((invoice) => invoice.id);
  const allInvoicesSelected = allInvoiceIds.length > 0 && allInvoiceIds.every((invoiceId) => invoiceIds.includes(invoiceId));
  const selectedExpenseIds = new Set([
    ...expenseIds,
    ...Object.entries(expenseRepayments)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([expenseId]) => Number(expenseId)),
  ]);
  const repaymentTotal = Object.values(expenseRepayments).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  const totalPct = splits.reduce((sum, split) => sum + (Number(split.split_pct) || 0), 0);
  const pctWarning = Math.abs(totalPct - 100) > 0.01 && splits.length > 0;

  const userOptions = [
    { value: "", label: "Пользователь" },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];

  const userName = (userId, fallback) => fallback || users.find((user) => user.id === userId)?.name || "?";

  const handleSubmit = () => {
    onSubmit({ preventDefault: () => {} });
  };

  const handleAddSplit = () => {
    setForm((prev) => ({
      ...prev,
      splits: [...(prev.splits || []), { user_id: null, split_pct: 0 }],
    }));
  };

  const handleRemoveSplit = (index) => {
    setForm((prev) => ({
      ...prev,
      splits: (prev.splits || []).filter((_, splitIndex) => splitIndex !== index),
    }));
  };

  const handleSplitUserChange = (index, userId) => {
    setForm((prev) => {
      const nextSplits = [...(prev.splits || [])];
      nextSplits[index] = { ...nextSplits[index], user_id: userId };
      return { ...prev, splits: nextSplits };
    });
  };

  const handleSplitPctChange = (index, value) => {
    setForm((prev) => {
      const nextSplits = [...(prev.splits || [])];
      nextSplits[index] = { ...nextSplits[index], split_pct: Number(value) || 0 };
      return { ...prev, splits: nextSplits };
    });
  };

  const toggleInvoice = (invoiceId) => {
    setForm((prev) => {
      const ids = prev.invoice_ids || [];
      const nextIds = ids.includes(invoiceId) ? ids.filter((id) => id !== invoiceId) : [...ids, invoiceId];
      return { ...prev, invoice_ids: nextIds };
    });
  };

  const toggleAllInvoices = () => {
    setForm((prev) => {
      const ids = prev.invoice_ids || [];
      if (allInvoiceIds.length > 0 && allInvoiceIds.every((invoiceId) => ids.includes(invoiceId))) {
        return { ...prev, invoice_ids: ids.filter((id) => !allInvoiceIds.includes(id)) };
      }
      return { ...prev, invoice_ids: Array.from(new Set([...ids, ...allInvoiceIds])) };
    });
  };

  const handleExpenseRepaymentChange = (expense, value) => {
    setForm((prev) => {
      const normalized = normalizeRepaymentAmount(value, expense);
      const nextRepayments = { ...(prev.expense_repayments || {}) };
      if (normalized > 0) {
        nextRepayments[expense.id] = normalized;
      } else {
        delete nextRepayments[expense.id];
      }
      return {
        ...prev,
        expense_ids: (prev.expense_ids || []).filter((id) => id !== expense.id),
        expense_repayments: nextRepayments,
      };
    });
  };

  const toggleExpense = (expense) => {
    setForm((prev) => {
      const current = Number(prev.expense_repayments?.[expense.id]) || 0;
      const nextRepayments = { ...(prev.expense_repayments || {}) };
      if (current > 0 || (prev.expense_ids || []).includes(expense.id)) {
        delete nextRepayments[expense.id];
      } else {
        const remaining = expenseRemainingAmount(expense);
        if (remaining > 0) nextRepayments[expense.id] = remaining;
      }
      return {
        ...prev,
        expense_ids: (prev.expense_ids || []).filter((id) => id !== expense.id),
        expense_repayments: nextRepayments,
      };
    });
  };

  const invoiceColumns = [
    {
      title: (
        <Button
          size="small"
          onClick={toggleAllInvoices}
          disabled={availableInvoices.length === 0}
          className="payout-modal__select-all"
        >
          {allInvoicesSelected ? "Снять" : "Все"}
        </Button>
      ),
      width: 38,
      align: "center",
      render: (_, invoice) => (
        <Checkbox
          data-eopp-component="PayoutInvoiceCheckbox"
          checked={invoiceIds.includes(invoice.id)}
          onChange={() => toggleInvoice(invoice.id)}
        />
      ),
    },
    {
      title: "Счет",
      width: 160,
      render: (_, invoice) => (
        <div className="payout-modal__stack-cell">
          <strong>#{invoice.id} {invoice.invoice_number || ""}</strong>
          {invoice.comment && <span className="text-muted">{invoice.comment}</span>}
        </div>
      ),
    },
    {
      title: "Сумма",
      dataIndex: "debt_amount",
      width: 110,
      align: "right",
      render: (value, invoice) => (
        <div className="payout-modal__stack-cell payout-modal__stack-cell--right">
          <strong>{formatMoney(value)}</strong>
          {invoice.total_amount !== invoice.debt_amount && <span className="text-muted">всего {formatMoney(invoice.total_amount)}</span>}
        </div>
      ),
    },
    {
      title: "Распределение",
      width: 130,
      render: (_, invoice) => allocationLabel(invoice.allocation) || <span className="text-muted">-</span>,
    },
  ];

  const expenseColumns = [
    {
      title: "",
      width: 38,
      align: "center",
      render: (_, expense) => (
        <Checkbox
          data-eopp-component="PayoutExpenseCheckbox"
          checked={selectedExpenseIds.has(expense.id)}
          onChange={() => toggleExpense(expense)}
        />
      ),
    },
    {
      title: "Расход",
      render: (_, expense) => (
        <div className="payout-modal__stack-cell">
          <strong>#{expense.id} {expense.reason}</strong>
          {expense.user_name && <span className="text-muted">{expense.user_name}</span>}
          {allocationLabel(expense.allocation) && <span className="text-muted">{allocationLabel(expense.allocation)}</span>}
        </div>
      ),
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 92,
      align: "right",
      render: (value) => <strong>{formatMoney(value)}</strong>,
    },
    {
      title: "Остаток",
      width: 92,
      align: "right",
      render: (_, expense) => <strong>{formatMoney(expenseRemainingAmount(expense))}</strong>,
    },
    {
      title: "Списать",
      width: 112,
      align: "right",
      render: (_, expense) => (
        <InputNumber
          data-eopp-component="PayoutExpenseRepaymentInput"
          size="small"
          min={0}
          max={expenseRemainingAmount(expense)}
          step={1}
          value={expenseRepaymentAmount(expense.id) || null}
          onChange={(value) => handleExpenseRepaymentChange(expense, value)}
          className="payout-modal__amount"
        />
      ),
    },
  ];

  const splitColumns = [
    {
      title: "Участник",
      render: (_, split, index) => (
        <SelectInput
          size="small"
          value={split.user_id ?? ""}
          onChange={(value) => handleSplitUserChange(index, value ? Number(value) : null)}
          options={userOptions}
          allowClear={false}
          className="payout-modal__select"
        />
      ),
    },
    {
      title: "Доля",
      width: 140,
      align: "right",
      render: (_, split, index) => (
        <InputNumber
          data-eopp-component="PayoutSplitPctInput"
          size="small"
          min={0}
          max={100}
          step={0.01}
          value={split.split_pct}
          onChange={(value) => handleSplitPctChange(index, value)}
          addonAfter="%"
          status={pctWarning ? "warning" : undefined}
          className="payout-modal__pct"
        />
      ),
    },
    {
      title: "",
      width: 78,
      align: "right",
      render: (_, __, index) => (
        <Button size="small" variant="danger" onClick={() => handleRemoveSplit(index)}>
          Удалить
        </Button>
      ),
    },
  ];

  const previewShares = preview?.shares || [];
  const previewNetNegative = Number(preview?.net_amount) < 0;
  const previewTotals = previewShares.reduce(
    (totals, share) => ({
      split_pct: totals.split_pct + (Number(share.split_pct) || 0),
      profit_share: totals.profit_share + (Number(share.profit_share) || 0),
      commission_amount: totals.commission_amount + (Number(share.commission_amount) || 0),
      tax_amount: totals.tax_amount + (Number(share.tax_amount) || 0),
      expenses_compensation: totals.expenses_compensation + (Number(share.expenses_compensation) || 0),
      operator_amount: totals.operator_amount + (Number(share.operator_amount) || 0),
      operator_icons: totals.operator_icons + (Number(share.operator_icons) || 0),
      executor_amount: totals.executor_amount + (Number(share.executor_amount) || 0),
      executor_count: totals.executor_count + (Number(share.executor_count) || 0),
    }),
    {
      split_pct: 0,
      profit_share: 0,
      commission_amount: 0,
      tax_amount: 0,
      expenses_compensation: 0,
      operator_amount: 0,
      operator_icons: 0,
      executor_amount: 0,
      executor_count: 0,
    },
  );
  const previewGrandTotal =
    previewTotals.profit_share +
    previewTotals.commission_amount +
    previewTotals.tax_amount +
    previewTotals.expenses_compensation +
    previewTotals.operator_amount +
    previewTotals.executor_amount;
  const previewColumns = [
    {
      title: "Участник",
      render: (_, share) => (
        <strong className="payout-modal__preview-name">{userName(share.user_id, share.user_name)}</strong>
      ),
    },
    { title: "%", dataIndex: "split_pct", width: 54, align: "right", render: (value) => `${value}%` },
    { title: "Приб.", dataIndex: "profit_share", width: 86, align: "right", render: formatMoney },
    { title: "Ком.", dataIndex: "commission_amount", width: 86, align: "right", render: formatMoney },
    { title: "Налог", dataIndex: "tax_amount", width: 82, align: "right", render: formatMoney },
    { title: "Расх.", dataIndex: "expenses_compensation", width: 86, align: "right", render: formatMoney },
    { title: "Опер.", dataIndex: "operator_amount", width: 96, align: "right", render: (value, share) => `${formatMoney(value)} / ${share.operator_icons || 0}` },
    { title: "Исп.", dataIndex: "executor_amount", width: 96, align: "right", render: (value, share) => `${formatMoney(value)} / ${share.executor_count || 0}` },
    { title: "Итого", dataIndex: "total", width: 92, align: "right", render: (value) => <strong>{formatMoney(value)}</strong> },
  ];
  const financeEntryColumns = [
    { title: "Тип", dataIndex: "kind", width: 150, render: (value) => financeKindLabel(value) },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 110,
      align: "right",
      render: (value) => (
        <span className={Number(value) < 0 ? "text-danger font-monospace" : "text-success font-monospace"}>
          {formatMoney(value)}
        </span>
      ),
    },
    {
      title: "Участник",
      dataIndex: "user_name",
      width: 140,
      ellipsis: true,
      render: (value, entry) => value || entry.user_login || entry.user_id || "-",
    },
    { title: "Счет", dataIndex: "invoice_id", width: 78, render: (value) => (value ? `#${value}` : "-") },
    { title: "Usage", dataIndex: "usage_log_id", width: 78, render: (value) => (value ? `#${value}` : "-") },
    { title: "Статус", dataIndex: "edit_state", width: 96, render: (value) => editStateLabel(value) },
    { title: "Дата", dataIndex: "created_at", width: 120, render: formatDateTime },
    { title: "Комментарий", dataIndex: "comment", ellipsis: true, render: (value) => value || "-" },
  ];
  const financeEntriesTotal = financeEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  return (
    <Modal
      data-eopp-component="PayoutModal"
      title={form.id ? "Редактировать выплату" : "Новая выплата"}
      open={show}
      onCancel={onClose}
      width={980}
      destroyOnClose
      footer={[
        <Button key="cancel" size="small" onClick={onClose}>
          Отмена
        </Button>,
        <Button
          key="submit"
          size="small"
          variant="primary"
          onClick={handleSubmit}
          disabled={pctWarning || previewNetNegative || splits.length === 0}
        >
          {form.id ? "Сохранить" : "Создать"}
        </Button>,
      ]}
    >
      <div className="payout-modal">
        <label className="form-label small mb-0">
          Название
          <TextInput
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Выплата за май 2026"
            required
          />
        </label>

        <div className="payout-modal__resource-grid">
          <section className="payout-modal__section">
            <div className="payout-modal__section-title">
              Счета <span className="text-muted">({invoiceIds.length} из {availableInvoices.length})</span>
            </div>
            <div className="payout-modal__resource-table-frame">
              <DataTable
                className="payout-modal__table"
                rowKey="id"
                data={availableInvoices}
                columns={invoiceColumns}
                emptyText="Нет счетов"
                pagination={false}
                scroll={false}
              />
            </div>
          </section>

          <section className="payout-modal__section">
            <div className="payout-modal__section-title">
              Расходы <span className="text-muted">({selectedExpenseIds.size} из {availableExpenses.length}, {formatMoney(repaymentTotal)})</span>
            </div>
            <div className="payout-modal__resource-table-frame">
              <DataTable
                className="payout-modal__table"
                rowKey="id"
                data={availableExpenses}
                columns={expenseColumns}
                emptyText="Нет расходов"
                pagination={false}
                scroll={false}
              />
            </div>
          </section>
        </div>

        <section className="payout-modal__section">
          <div className="payout-modal__section-title">
            <span>Предварительный расчет</span>
            <SegmentedControl
              size="small"
              value={previewTab}
              onChange={setPreviewTab}
              options={[
                { value: "summary", label: "Сводка" },
                { value: "entries", label: "Проводки" },
                { value: "splits", label: "Доли" },
              ]}
            />
          </div>
          {previewTab === "splits" ? (
            <>
              <div className="payout-modal__section-title payout-modal__section-title--nested">
                <span>Участники и доли</span>
                <Button size="small" variant="primary" onClick={handleAddSplit}>
                  Добавить
                </Button>
              </div>
              <DataTable
                className="payout-modal__table"
                rowKey={(_, index) => index}
                data={splits}
                columns={splitColumns}
                emptyText="Добавьте участников"
                pagination={false}
                scroll={false}
              />
              {pctWarning && (
                <Alert
                  data-eopp-component="PayoutSplitWarning"
                  type="warning"
                  showIcon
                  message={`Сумма долей: ${totalPct.toFixed(1)}%, должно быть 100%`}
                />
              )}
            </>
          ) : previewLoading ? (
              <div className="payout-modal__preview-loading">
                <Spin size="small" /> <span>Расчет...</span>
              </div>
            ) : preview && previewTab === "summary" ? (
              <>
                <DataTable
                  className="payout-modal__table payout-modal__preview-table"
                  rowKey={(share) => share.user_id}
                  data={previewShares}
                  columns={previewColumns}
                  emptyText="Нет данных расчета"
                  pagination={false}
                  scroll={false}
                  tableLayout="fixed"
                  summary={() => (
                    <Table.Summary>
                      <Table.Summary.Row className="payout-modal__summary-row">
                        <Table.Summary.Cell index={0}>
                          <strong>Итого</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          <strong>{previewTotals.split_pct.toFixed(2)}%</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <strong>{formatMoney(previewTotals.profit_share)}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <strong>{formatMoney(previewTotals.commission_amount)}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">
                          <strong>{formatMoney(previewTotals.tax_amount)}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <strong>{formatMoney(previewTotals.expenses_compensation)}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">
                          <strong>{formatMoney(previewTotals.operator_amount)} / {previewTotals.operator_icons}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right">
                          <strong>{formatMoney(previewTotals.executor_amount)} / {previewTotals.executor_count}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={8} align="right">
                          <strong>{formatMoney(previewGrandTotal)}</strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />
                {previewNetNegative && (
                  <Alert
                    data-eopp-component="PayoutPreviewNetWarning"
                    type="warning"
                    showIcon
                    message="Сумма списаний превышает net выбранной выплаты"
                  />
                )}
                <div className="payout-modal__preview-note">
                  {preview.invoice_count} счетов, {preview.expense_count} расходов:
                  доход {formatMoney(preview.total_income)}
                  {" - "}расходы {formatMoney(preview.total_expenses)}
                  {Number(preview.total_operator_amount) > 0 && (
                    <>{" - "}операторы {formatMoney(preview.total_operator_amount)}</>
                  )}
                  {Number(preview.total_executor_amount) > 0 && (
                    <>{" - "}исполнители {formatMoney(preview.total_executor_amount)}</>
                  )}
                  {Number(preview.already_allocated) > 0 && (
                    <>{" - "}уже распределено {formatMoney(preview.already_allocated)}</>
                  )}
                  {" = "}<strong>net {formatMoney(preview.net_amount)}</strong>
                </div>
              </>
            ) : previewTab === "summary" ? (
              <div className="payout-modal__preview-note">Выберите счета или расходы для предварительного расчета</div>
            ) : previewTab === "entries" ? (
              <>
                {financeEntriesError && (
                  <Alert
                    data-eopp-component="PayoutFinanceEntriesError"
                    type="warning"
                    showIcon
                    message={financeEntriesError}
                  />
                )}
                <DataTable
                  className="payout-modal__table"
                  rowKey="id"
                  data={financeEntries}
                  columns={financeEntryColumns}
                  loading={financeEntriesLoading}
                  emptyText="Нет связанных проводок"
                  pagination={false}
                  scroll={{ x: 860, y: 180 }}
                />
                <div className="payout-modal__preview-note">
                  Проводок {financeEntries.length}: <strong>{formatMoney(financeEntriesTotal)}</strong>
                </div>
              </>
            ) : null}
        </section>
      </div>
    </Modal>
  );
}
