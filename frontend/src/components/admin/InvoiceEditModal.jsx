import React, { useEffect, useState } from "react";
import { Input, InputNumber, Modal } from "antd";
import { formatMoney } from "../../utils/format";
import { Button, DataTable, SelectInput, TextInput } from "../../ui";

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
    setScreenMode(false);
    setPrintMode(false);
    setLogsLoading(true);
    fetch(`/usage-log?invoice_id=${invoice.id}`)
      .then((response) => response.json())
      .then((data) => setUsageLogs(Array.isArray(data) ? data : []))
      .catch(() => setUsageLogs([]))
      .finally(() => setLogsLoading(false));
  }, [show, invoice, adminToken]);

  if (!invoice) return null;

  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const printRate = form.percent_rate || invoice.percent_rate || 0;
  const printTaxRate = form.tax_rate || invoice.tax_rate || 0;
  const printPercent = form.percent_amount || invoice.percent_amount || Math.round(itemsTotal * printRate / 100);
  const printTax = form.tax_amount || invoice.tax_amount || Math.round(itemsTotal * printTaxRate / 100);
  const printDebt = form.debt_amount || invoice.debt_amount || 0;
  const printFinal = form.total_amount || invoice.total_amount || (itemsTotal + printPercent + printTax);

  const userOptions = [
    { value: "", label: "Не указан" },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];

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
    setLoading(true);
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          comment: form.comment,
          percent_rate: form.percent_rate,
          tax_rate: form.tax_rate,
          debt_amount: form.debt_amount,
          percent_amount: form.percent_amount,
          tax_amount: form.tax_amount,
          total_amount: form.total_amount,
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
        width={940}
        destroyOnClose
        footer={
          screenMode
            ? null
            : [
                <Button key="cancel" size="small" onClick={onClose}>
                  Отмена
                </Button>,
                <Button key="submit" size="small" variant="primary" loading={loading} onClick={handleSubmit}>
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
              <section className="invoice-modal__section">
                <div className="invoice-modal__section-title">
                  <span>Строки счета</span>
                  <Button size="small" variant="primary" onClick={addItem}>
                    Добавить
                  </Button>
                </div>
                <DataTable
                  className="invoice-modal__table"
                  rowKey={(_, index) => index}
                  data={items}
                  columns={itemColumns}
                  emptyText="Нет строк"
                  pagination={false}
                  scroll={false}
                />
                <div className="invoice-modal__inline-total">Сумма строк: {formatMoney(itemsTotal)}</div>
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

              <div className="invoice-modal__form-grid invoice-modal__form-grid--four">
                <label className="form-label small mb-0">
                  Сумма долга
                  <InputNumber
                    data-eopp-component="InvoiceEditDebtAmount"
                    size="small"
                    min={0}
                    value={form.debt_amount}
                    onChange={(value) => updateForm("debt_amount", Number(value) || 0)}
                    addonAfter="₽"
                    className="invoice-modal__amount-input"
                  />
                </label>
                <label className="form-label small mb-0">
                  Итого
                  <InputNumber
                    data-eopp-component="InvoiceEditTotalAmount"
                    size="small"
                    min={0}
                    value={form.total_amount}
                    onChange={(value) => updateForm("total_amount", Number(value) || 0)}
                    addonAfter="₽"
                    className="invoice-modal__amount-input"
                  />
                </label>
                <label className="form-label small mb-0">
                  Комиссия, %
                  <InputNumber
                    data-eopp-component="InvoiceEditPercentRate"
                    size="small"
                    min={0}
                    max={99}
                    step={0.01}
                    value={form.percent_rate}
                    onChange={(value) => updateForm("percent_rate", Number(value) || 0)}
                    className="invoice-modal__number"
                  />
                </label>
                <label className="form-label small mb-0">
                  Налог, %
                  <InputNumber
                    data-eopp-component="InvoiceEditTaxRate"
                    size="small"
                    min={0}
                    max={99}
                    step={0.01}
                    value={form.tax_rate}
                    onChange={(value) => updateForm("tax_rate", Number(value) || 0)}
                    className="invoice-modal__number"
                  />
                </label>
                <label className="form-label small mb-0">
                  Комиссию получает
                  <SelectInput
                    value={form.commission_user_id ?? ""}
                    onChange={(value) => updateForm("commission_user_id", value ? Number(value) : null)}
                    options={userOptions}
                    allowClear={false}
                  />
                </label>
                <label className="form-label small mb-0">
                  Налог платит
                  <SelectInput
                    value={form.tax_user_id ?? ""}
                    onChange={(value) => updateForm("tax_user_id", value ? Number(value) : null)}
                    options={userOptions}
                    allowClear={false}
                  />
                </label>
              </div>

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
