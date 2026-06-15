import { adminRequest } from "../shared/adminClient";
import React, { useEffect, useState } from "react";
import { Input, InputNumber, Modal } from "antd";
import { formatMoney } from "../../../utils/format";
import { Button, DataTable, SegmentedControl, TextInput } from "../../../ui";
import { editStateLabel, financeKindLabel, formatDateTime } from "../finance/financeFormat";
import { InvoiceAccountingTable, hasInvoiceRecipientErrors } from "./InvoiceRecipientFields";

function adminHeaders() {
  return { "Content-Type": "application/json" };
}

function formatLogDate(value) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "-";
}

export function InvoiceEditModal({ show, invoice, onClose, onSave, adminToken, users = [] }) {
  const [form, setForm] = useState({
    comment: "",
    percent_rate: 0,
    tax_rate: 0,
    debt_amount: 0,
    percent_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    commission_user_id: null,
    tax_user_id: null,
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usageLogs, setUsageLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [financeEntries, setFinanceEntries] = useState([]);
  const [financeEntriesLoading, setFinanceEntriesLoading] = useState(false);
  const [profitView, setProfitView] = useState("summary");
  const [screenMode, setScreenMode] = useState(false);
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    if (!show || !invoice) return;
    setForm({
      comment: invoice.comment || "",
      percent_rate: invoice.percent_rate || 0,
      tax_rate: invoice.tax_rate || 0,
      debt_amount: invoice.debt_amount || 0,
      percent_amount: invoice.percent_amount || 0,
      tax_amount: invoice.tax_amount || 0,
      total_amount: invoice.total_amount || 0,
      commission_user_id: invoice.commission_user_id || null,
      tax_user_id: invoice.tax_user_id || null,
    });
    setItems(invoice.items || []);
    setFinanceEntries([]);
    setProfitView("summary");
    setScreenMode(false);
    setPrintMode(false);
    setLogsLoading(true);
    adminRequest(`/usage-log?invoice_id=${invoice.id}`)
      .then((response) => response.json())
      .then((data) => setUsageLogs(Array.isArray(data) ? data : []))
      .catch(() => setUsageLogs([]))
      .finally(() => setLogsLoading(false));
    setFinanceEntriesLoading(true);
    adminRequest(`/admin/finance-entries?invoice_id=${invoice.id}`)
      .then((response) => response.json())
      .then((data) => setFinanceEntries(Array.isArray(data) ? data : []))
      .catch(() => setFinanceEntries([]))
      .finally(() => setFinanceEntriesLoading(false));
  }, [show, invoice, adminToken]);

  if (!invoice) return null;

  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const taxCommissionMode = invoice.tax_commission_mode === "included" ? "included" : "added";
  const editDebt = form.debt_amount || itemsTotal;
  const editCombinedRate = (form.percent_rate || 0) + (form.tax_rate || 0);
  const editDivisor = editCombinedRate < 100 ? 1 - editCombinedRate / 100 : 0;
  const editTotal = taxCommissionMode === "included"
    ? editDebt
    : (editDivisor > 0 ? Math.round(editDebt / editDivisor) : 0);
  const editPercent = Math.round(editTotal * (form.percent_rate || 0) / 100);
  const editTax = Math.round(editTotal * (form.tax_rate || 0) / 100);
  const recipientErrors = hasInvoiceRecipientErrors({
    commissionAmount: editPercent,
    taxAmount: editTax,
    commissionUserId: form.commission_user_id,
    taxUserId: form.tax_user_id,
  });
  const hasRecipientErrors = recipientErrors.commission || recipientErrors.tax;
  const printRate = form.percent_rate || invoice.percent_rate || 0;
  const printTaxRate = form.tax_rate || invoice.tax_rate || 0;
  const printPercent = editPercent || invoice.percent_amount || Math.round(itemsTotal * printRate / 100);
  const printTax = editTax || invoice.tax_amount || Math.round(itemsTotal * printTaxRate / 100);
  const printDebt = editDebt || invoice.debt_amount || 0;
  const printFinal = editTotal || invoice.total_amount || (itemsTotal + printPercent + printTax);
  const operatorAmount = Number(invoice.operator_amount || 0);
  const executorAmount = Number(invoice.executor_amount || 0);
  const sidePayoutAmount = Number(invoice.side_payout_amount || operatorAmount + executorAmount || 0);
  const profitDeductions = taxCommissionMode === "included" ? editPercent + editTax : 0;
  const profitAmount = editDebt - profitDeductions - sidePayoutAmount;

  const addItem = () => setItems((prev) => [...prev, { description: "", amount: 0, sort_order: prev.length }]);
  const removeItem = (index) => setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: field === "amount" ? (Number(value) || 0) : value };
      return next;
    });
  };
  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (hasRecipientErrors) return;
    setLoading(true);
    try {
      const res = await adminRequest(`/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          comment: form.comment,
          percent_rate: form.percent_rate,
          tax_rate: form.tax_rate,
          debt_amount: editDebt,
          percent_amount: editPercent,
          tax_amount: editTax,
          total_amount: editTotal,
          commission_user_id: form.commission_user_id,
          tax_user_id: form.tax_user_id,
          items: items.map((item, index) => ({
            description: item.description,
            amount: Number(item.amount) || 0,
            sort_order: index,
          })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSave?.(await res.json());
      onClose();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const itemColumns = [
    {
      title: "Описание",
      dataIndex: "description",
      render: (value, _item, index) => (
        <TextInput
          size="small"
          value={value}
          onChange={(event) => updateItem(index, "description", event.target.value)}
          placeholder="Описание строки"
        />
      ),
    },
    {
      title: "Сумма",
      dataIndex: "amount",
      width: 150,
      align: "right",
      render: (value, _item, index) => (
        <InputNumber
          data-eopp-component="InvoiceEditItemAmount"
          size="small"
          min={0}
          value={value}
          onChange={(nextValue) => updateItem(index, "amount", nextValue)}
          addonAfter="₽"
          className="invoice-modal__amount-input"
        />
      ),
    },
    {
      title: "",
      width: 76,
      align: "right",
      render: (_, __, index) => (
        <Button size="small" variant="danger" onClick={() => removeItem(index)}>
          Удалить
        </Button>
      ),
    },
  ];

  const logColumns = [
    { title: "ID", dataIndex: "id", width: 72 },
    { title: "Дата", dataIndex: "created_at", width: 100, render: formatLogDate },
    { title: "Ключ", width: 140, ellipsis: true, render: (_, log) => log.label || log.api_key_id || "-" },
    { title: "Сумма", dataIndex: "price", width: 96, align: "right", render: (value) => formatMoney(value) },
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
    { title: "Usage", dataIndex: "usage_log_id", width: 78, render: (value) => (value ? `#${value}` : "-") },
    { title: "Статус", dataIndex: "edit_state", width: 96, render: (value) => editStateLabel(value) },
    { title: "Дата", dataIndex: "created_at", width: 120, render: formatDateTime },
    { title: "Комментарий", dataIndex: "comment", ellipsis: true, render: (value) => value || "-" },
  ];
  const financeEntriesTotal = financeEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const preview = (
    <div className="invoice-modal__screen-preview">
      <div className="invoice-modal__screen-title">
        Счет #{invoice.id} {invoice.invoice_number ? `(${invoice.invoice_number})` : ""}
      </div>
      {items.map((item, index) => (
        <div key={index} className="invoice-modal__screen-line">
          <span>{item.description || `Строка ${index + 1}`}</span>
          <span>{formatMoney(item.amount)}</span>
        </div>
      ))}
      <div className="invoice-modal__screen-totals">
        <div className="invoice-modal__screen-line">
          <span>Строки</span>
          <span>{formatMoney(itemsTotal)}</span>
        </div>
        {printRate > 0 && (
          <div className="invoice-modal__screen-line is-muted">
            <span>Комиссия ({printRate}%)</span>
            <span>{formatMoney(printPercent)}</span>
          </div>
        )}
        {printTaxRate > 0 && (
          <div className="invoice-modal__screen-line is-muted">
            <span>Налог ({printTaxRate}%)</span>
            <span>{formatMoney(printTax)}</span>
          </div>
        )}
        {printDebt > 0 && (
          <div className="invoice-modal__screen-line is-muted">
            <span>Долг</span>
            <span>{formatMoney(printDebt)}</span>
          </div>
        )}
        <div className="invoice-modal__screen-line is-total">
          <span>К оплате</span>
          <span>{formatMoney(printFinal)}</span>
        </div>
      </div>
      {usageLogs.length > 0 && (
        <div className="invoice-modal__screen-logs">
          <strong>Записи:</strong>
          {usageLogs.map((log) => (
            <div key={log.id} className="invoice-modal__screen-line">
              <span>#{log.id} {formatLogDate(log.created_at)} {log.label || ""}</span>
              <span>{formatMoney(log.price)}</span>
            </div>
          ))}
        </div>
      )}
      {form.comment && <div className="invoice-modal__screen-comment">{form.comment}</div>}
    </div>
  );

  return (
    <>
      <Modal
        data-eopp-component="InvoiceEditModal"
        title={`Редактировать счет #${invoice.id}`}
        open={show}
        onCancel={onClose}
        width={980}
        destroyOnClose
        footer={
          screenMode
            ? null
            : [
                <Button key="cancel" size="small" onClick={onClose}>
                  Отмена
                </Button>,
                <Button key="submit" size="small" variant="primary" loading={loading} onClick={handleSubmit} disabled={hasRecipientErrors}>
                  Сохранить
                </Button>,
              ]
        }
      >
        <div className="invoice-modal">
          <div className="invoice-modal__header-actions">
            <Button size="small" onClick={() => setPrintMode(true)}>
              Печать
            </Button>
            <Button size="small" variant={screenMode ? "primary" : "secondary"} onClick={() => setScreenMode((value) => !value)}>
              {screenMode ? "Форма" : "Превью"}
            </Button>
          </div>

          {screenMode ? (
            preview
          ) : (
            <>
              <section className="invoice-modal__section invoice-modal__section--compact">
                <div className="invoice-modal__section-title">
                  <span>Строки счета</span>
                  <Button size="small" variant="primary" onClick={addItem}>
                    Добавить
                  </Button>
                </div>
                {items.length > 0 ? (
                  <>
                    <DataTable
                      className="invoice-modal__table invoice-modal__table--compact"
                      rowKey={(_, index) => index}
                      data={items}
                      columns={itemColumns}
                      emptyText="Нет строк"
                      pagination={false}
                      scroll={false}
                    />
                    <div className="invoice-modal__inline-total">Сумма строк: {formatMoney(itemsTotal)}</div>
                  </>
                ) : (
                  <div className="invoice-modal__empty-line">
                    <span>Строк нет</span>
                    <span>Сумма строк: {formatMoney(itemsTotal)}</span>
                  </div>
                )}
              </section>

              <section className="invoice-modal__section">
                <div className="invoice-modal__section-title">Записи в счете</div>
                <DataTable
                  className="invoice-modal__table"
                  rowKey="id"
                  data={usageLogs}
                  columns={logColumns}
                  loading={logsLoading}
                  emptyText="Нет привязанных записей"
                  pagination={false}
                  scroll={{ x: 420, y: 160 }}
                />
              </section>

              <InvoiceAccountingTable
                users={users}
                debtAmount={editDebt}
                debtEditable
                debtLabel="Строки / ручная сумма"
                onDebtChange={(value) => updateForm("debt_amount", value)}
                commissionRate={form.percent_rate}
                taxRate={form.tax_rate}
                commissionAmount={editPercent}
                taxAmount={editTax}
                totalAmount={editTotal}
                commissionUserId={form.commission_user_id}
                taxUserId={form.tax_user_id}
                onCommissionRateChange={(value) => updateForm("percent_rate", value)}
                onTaxRateChange={(value) => updateForm("tax_rate", value)}
                onCommissionChange={(value) => updateForm("commission_user_id", value)}
                onTaxChange={(value) => updateForm("tax_user_id", value)}
                componentPrefix="InvoiceEdit"
              />

              <section className="invoice-modal__section invoice-modal__section--compact">
                <div className="invoice-modal__section-title">
                  <span>Расчёт прибыли</span>
                  <SegmentedControl
                    size="small"
                    value={profitView}
                    onChange={setProfitView}
                    options={[
                      { value: "summary", label: "Сводка" },
                      { value: "entries", label: "Проводки" },
                    ]}
                  />
                </div>
                {profitView === "summary" ? (
                  <div className="invoice-finance-summary">
                    <div className="invoice-finance-summary__row">
                      <span>Долг</span>
                      <strong>{formatMoney(editDebt)}</strong>
                    </div>
                    <div className="invoice-finance-summary__row">
                      <span>Итого к оплате</span>
                      <strong>{formatMoney(editTotal)}</strong>
                    </div>
                    {taxCommissionMode === "included" && (
                      <>
                        <div className="invoice-finance-summary__row is-deduction">
                          <span>Минус комиссия</span>
                          <strong>{formatMoney(editPercent)}</strong>
                        </div>
                        <div className="invoice-finance-summary__row is-deduction">
                          <span>Минус налог</span>
                          <strong>{formatMoney(editTax)}</strong>
                        </div>
                      </>
                    )}
                    <div className="invoice-finance-summary__row is-deduction">
                      <span>Минус операторы</span>
                      <strong>{formatMoney(operatorAmount)}</strong>
                    </div>
                    <div className="invoice-finance-summary__row is-deduction">
                      <span>Минус исполнители</span>
                      <strong>{formatMoney(executorAmount)}</strong>
                    </div>
                    {sidePayoutAmount !== operatorAmount + executorAmount && (
                      <div className="invoice-finance-summary__row is-deduction">
                        <span>Минус операторы/исполнители</span>
                        <strong>{formatMoney(sidePayoutAmount)}</strong>
                      </div>
                    )}
                    <div className="invoice-finance-summary__row invoice-finance-summary__row--profit">
                      <span>Прибыль</span>
                      <strong>{formatMoney(profitAmount)}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="invoice-finance-entries">
                    <DataTable
                      className="invoice-modal__table invoice-modal__table--compact"
                      rowKey="id"
                      data={financeEntries}
                      columns={financeEntryColumns}
                      loading={financeEntriesLoading}
                      emptyText="Нет проводок"
                      pagination={false}
                      scroll={{ x: 820, y: 180 }}
                    />
                    <div className="invoice-finance-entries__total">
                      <span>Сумма проводок</span>
                      <strong>{formatMoney(financeEntriesTotal)}</strong>
                    </div>
                  </div>
                )}
              </section>

              <label className="form-label small mb-0 invoice-modal__comment">
                Комментарий
                <Input.TextArea
                  data-eopp-component="InvoiceEditComment"
                  rows={2}
                  value={form.comment}
                  onChange={(event) => updateForm("comment", event.target.value)}
                />
              </label>
            </>
          )}
        </div>
      </Modal>

      {printMode && (
        <div data-eopp-component="InvoicePrintView" className="invoice-print-view">
          <div className="invoice-print-view__paper">
            <div className="invoice-print-view__header">
              <div>
                <div className="invoice-print-view__title">Счет #{invoice.id}</div>
                {invoice.invoice_number && <div className="invoice-print-view__number">№ {invoice.invoice_number}</div>}
              </div>
              <Button
                htmlType="button"
                className="invoice-print-view__button"
                onClick={() => {
                  setPrintMode(false);
                  setTimeout(() => window.print(), 100);
                }}
              >
                Печатать
              </Button>
            </div>
            <table className="invoice-print-view__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Описание</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{item.description || `Строка ${index + 1}`}</td>
                    <td>{formatMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="invoice-print-view__totals">
              <div><span>Строки:</span><span>{formatMoney(itemsTotal)}</span></div>
              {printRate > 0 && <div><span>Комиссия ({printRate}%):</span><span>{formatMoney(printPercent)}</span></div>}
              {printTaxRate > 0 && <div><span>Налог ({printTaxRate}%):</span><span>{formatMoney(printTax)}</span></div>}
              {printDebt > 0 && <div><span>Долг:</span><span>{formatMoney(printDebt)}</span></div>}
              <div className="is-total"><span>Итого к оплате:</span><span>{formatMoney(printFinal)}</span></div>
            </div>
            {usageLogs.length > 0 && (
              <div className="invoice-print-view__logs">
                <strong>Записи:</strong>
                {usageLogs.map((log) => (
                  <div key={log.id}>
                    <span>#{log.id} - {formatLogDate(log.created_at)} - {log.label || "-"}</span>
                    <span>{formatMoney(log.price)}</span>
                  </div>
                ))}
              </div>
            )}
            {form.comment && <div className="invoice-print-view__comment">{form.comment}</div>}
          </div>
        </div>
      )}
    </>
  );
}
