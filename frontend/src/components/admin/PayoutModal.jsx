import React, { useCallback, useEffect, useRef } from "react";
import { Alert, Checkbox, InputNumber, Modal, Spin } from "antd";
import { Button, DataTable, SelectInput, TextInput } from "../../ui";

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
}) {
  const timerRef = useRef(null);

  const triggerPreview = useCallback(
    (invoiceIds, expenseIds, splits) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onPreview?.(invoiceIds, expenseIds, splits);
      }, 400);
    },
    [onPreview],
  );

  useEffect(() => {
    if (!show) return undefined;
    const splits = (form.splits || []).filter((split) => split.user_id != null);
    if (splits.length > 0) {
      triggerPreview(form.invoice_ids || [], form.expense_ids || [], splits);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, form.invoice_ids, form.expense_ids, form.splits, triggerPreview]);

  const splits = form.splits || [];
  const invoiceIds = form.invoice_ids || [];
  const expenseIds = form.expense_ids || [];
  const totalPct = splits.reduce((sum, split) => sum + (Number(split.split_pct) || 0), 0);
  const pctWarning = Math.abs(totalPct - 100) > 0.01 && splits.length > 0;

  const userOptions = [
    { value: "", label: "Пользователь" },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];

  const userName = (userId) => users.find((user) => user.id === userId)?.name || "?";

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

  const toggleExpense = (expenseId) => {
    setForm((prev) => {
      const ids = prev.expense_ids || [];
      const nextIds = ids.includes(expenseId) ? ids.filter((id) => id !== expenseId) : [...ids, expenseId];
      return { ...prev, expense_ids: nextIds };
    });
  };

  const invoiceColumns = [
    {
      title: "",
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
          checked={expenseIds.includes(expense.id)}
          onChange={() => toggleExpense(expense.id)}
        />
      ),
    },
    {
      title: "Расход",
      render: (_, expense) => (
        <div className="payout-modal__stack-cell">
          <strong>#{expense.id} {expense.reason}</strong>
          {expense.user_name && <span className="text-muted">{expense.user_name}</span>}
        </div>
      ),
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 110,
      align: "right",
      render: (value) => <strong>{formatMoney(value)}</strong>,
    },
    {
      title: "Распределение",
      width: 130,
      render: (_, expense) => allocationLabel(expense.allocation) || <span className="text-muted">-</span>,
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
  const previewColumns = [
    { title: "Участник", width: 140, render: (_, share) => <strong>{userName(share.user_id)}</strong> },
    { title: "Доля", dataIndex: "split_pct", width: 70, align: "right", render: (value) => `${value}%` },
    { title: "Прибыль", dataIndex: "profit_share", width: 110, align: "right", render: formatMoney },
    { title: "Комиссия", dataIndex: "commission_amount", width: 110, align: "right", render: formatMoney },
    { title: "Налог", dataIndex: "tax_amount", width: 110, align: "right", render: formatMoney },
    { title: "Расходы", dataIndex: "expenses_compensation", width: 110, align: "right", render: formatMoney },
    { title: "Операторы", dataIndex: "operator_amount", width: 120, align: "right", render: (value, share) => `${formatMoney(value)} / ${share.operator_icons || 0}` },
    { title: "Итого", dataIndex: "total", width: 110, align: "right", render: (value) => <strong>{formatMoney(value)}</strong> },
  ];

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
          disabled={pctWarning || splits.length === 0}
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
            <DataTable
              className="payout-modal__table"
              rowKey="id"
              data={availableInvoices}
              columns={invoiceColumns}
              emptyText="Нет счетов"
              pagination={false}
              scroll={{ x: 500, y: 180 }}
            />
          </section>

          <section className="payout-modal__section">
            <div className="payout-modal__section-title">
              Расходы <span className="text-muted">({expenseIds.length} из {availableExpenses.length})</span>
            </div>
            <DataTable
              className="payout-modal__table"
              rowKey="id"
              data={availableExpenses}
              columns={expenseColumns}
              emptyText="Нет расходов"
              pagination={false}
              scroll={{ x: 500, y: 180 }}
            />
          </section>
        </div>

        <section className="payout-modal__section">
          <div className="payout-modal__section-title">
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
        </section>

        {(preview || previewLoading) && (
          <section className="payout-modal__section">
            <div className="payout-modal__section-title">Предварительный расчет</div>
            {previewLoading ? (
              <div className="payout-modal__preview-loading">
                <Spin size="small" /> <span>Расчет...</span>
              </div>
            ) : preview ? (
              <>
                <DataTable
                  className="payout-modal__table"
                  rowKey={(share) => share.user_id}
                  data={previewShares}
                  columns={previewColumns}
                  emptyText="Нет данных расчета"
                  pagination={false}
                  scroll={{ x: 760 }}
                />
                <div className="payout-modal__preview-note">
                  {preview.invoice_count} счетов, {preview.expense_count} расходов:
                  доход {formatMoney(preview.total_income)}
                  {" - "}расходы {formatMoney(preview.total_expenses)}
                  {" = "}<strong>net {formatMoney(preview.net_amount)}</strong>
                </div>
              </>
            ) : null}
          </section>
        )}
      </div>
    </Modal>
  );
}
