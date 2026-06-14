import React, { useState } from "react";
import { Input, InputNumber, Modal } from "antd";
import { formatMoney } from "../../../utils/format";
import { Button, DataTable, SelectInput, TextInput } from "../../../ui";

function adminHeaders() {
  return { "Content-Type": "application/json" };
}

const EMPTY_ITEM = { description: "", amount: 0 };

export function InvoiceCreateModal({ show, onClose, onCreated, adminToken, users = [] }) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [comment, setComment] = useState("");
  const [percentRate, setPercentRate] = useState(5);
  const [taxRate, setTaxRate] = useState(6);
  const [commissionUserId, setCommissionUserId] = useState(null);
  const [taxUserId, setTaxUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const userOptions = [
    { value: "", label: "Не указан" },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];

  const addItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === "amount" ? (Number(value) || 0) : value };
      return next;
    });
  };

  const resetForm = () => {
    setInvoiceNumber("");
    setComment("");
    setPercentRate(5);
    setTaxRate(6);
    setCommissionUserId(null);
    setTaxUserId(null);
    setItems([]);
  };

  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const combinedRate = percentRate + taxRate;
  const divisor = combinedRate < 100 ? 1 - combinedRate / 100 : 0;
  const calcTotal = divisor > 0 ? Math.round(itemsTotal / divisor) : 0;
  const calcPercent = Math.round(calcTotal * percentRate / 100);
  const calcTax = Math.round(calcTotal * taxRate / 100);

  const handleSubmit = async () => {
    if (items.length === 0 || itemsTotal <= 0) return;
    setLoading(true);
    try {
      const body = {
        invoice_number: invoiceNumber || undefined,
        comment,
        percent_rate: percentRate,
        tax_rate: taxRate,
        debt_amount: itemsTotal,
        percent_amount: calcPercent,
        tax_amount: calcTax,
        total_amount: calcTotal,
        commission_user_id: commissionUserId,
        tax_user_id: taxUserId,
        items: items.map((item, index) => ({
          description: item.description,
          amount: Number(item.amount) || 0,
          sort_order: index,
        })),
      };
      const res = await fetch("/admin/invoices", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onCreated?.(data);
      resetForm();
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
          data-eopp-component="InvoiceCreateItemAmount"
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

  return (
    <Modal
      data-eopp-component="InvoiceCreateModal"
      title="Новый счет"
      open={show}
      onCancel={onClose}
      width={900}
      destroyOnClose
      footer={[
        <Button key="cancel" size="small" onClick={onClose}>
          Отмена
        </Button>,
        <Button
          key="submit"
          size="small"
          variant="primary"
          loading={loading}
          onClick={handleSubmit}
          disabled={items.length === 0 || itemsTotal <= 0}
        >
          Создать
        </Button>,
      ]}
    >
      <div className="invoice-modal">
        <div className="invoice-modal__form-grid">
          <label className="form-label small mb-0">
            Номер счета
            <TextInput
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="Авто, если пусто"
            />
          </label>
          <label className="form-label small mb-0">
            Комиссию получает
            <SelectInput
              value={commissionUserId ?? ""}
              onChange={(value) => setCommissionUserId(value ? Number(value) : null)}
              options={userOptions}
              allowClear={false}
            />
          </label>
          <label className="form-label small mb-0">
            Налог платит
            <SelectInput
              value={taxUserId ?? ""}
              onChange={(value) => setTaxUserId(value ? Number(value) : null)}
              options={userOptions}
              allowClear={false}
            />
          </label>
        </div>

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
            emptyText="Добавьте хотя бы одну строку"
            pagination={false}
            scroll={false}
          />
        </section>

        <section className="invoice-modal__grid">
          <div className="invoice-modal__summary">
            <span className="text-muted">Сумма строк</span>
            <strong>{formatMoney(itemsTotal)}</strong>
          </div>
          <label className="form-label small mb-0">
            Комиссия, %
            <InputNumber
              data-eopp-component="InvoiceCreatePercentRate"
              size="small"
              min={0}
              max={99}
              step={0.01}
              value={percentRate}
              onChange={(value) => setPercentRate(Number(value) || 0)}
              className="invoice-modal__number"
            />
            <span className="text-muted">{formatMoney(calcPercent)} от итого</span>
          </label>
          <label className="form-label small mb-0">
            Налог, %
            <InputNumber
              data-eopp-component="InvoiceCreateTaxRate"
              size="small"
              min={0}
              max={99}
              step={0.01}
              value={taxRate}
              onChange={(value) => setTaxRate(Number(value) || 0)}
              className="invoice-modal__number"
            />
            <span className="text-muted">{formatMoney(calcTax)} от итого</span>
          </label>
          <div className="invoice-modal__summary invoice-modal__summary--total">
            <span>Итого</span>
            <strong>{formatMoney(calcTotal)}</strong>
          </div>
        </section>

        <label className="form-label small mb-0 invoice-modal__comment">
          Комментарий
          <Input.TextArea
            data-eopp-component="InvoiceCreateComment"
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
