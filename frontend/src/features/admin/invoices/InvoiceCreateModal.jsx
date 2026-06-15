import { adminRequest } from "../shared/adminClient";
import React, { useEffect, useState } from "react";
import { Input, InputNumber, Modal } from "antd";
import { formatMoney } from "../../../utils/format";
import { Button, DataTable, SelectInput, TextInput } from "../../../ui";
import { InvoiceAccountingTable, hasInvoiceRecipientErrors } from "./InvoiceRecipientFields";

function adminHeaders() {
  return { "Content-Type": "application/json" };
}

const EMPTY_ITEM = { description: "", amount: 0 };

function taxCommissionModeForCompany(companySettings, company) {
  return companySettings.find((setting) => setting.company === company)?.tax_commission_mode === "included"
    ? "included"
    : "added";
}

function billingSettingForCompany(companySettings, company) {
  return companySettings.find((setting) => setting.company === company) || null;
}

export function InvoiceCreateModal({
  show,
  onClose,
  onCreated,
  adminToken,
  users = [],
  companies = [],
  companySettings = [],
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [company, setCompany] = useState("");
  const [comment, setComment] = useState("");
  const [percentRate, setPercentRate] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [commissionUserId, setCommissionUserId] = useState(null);
  const [taxUserId, setTaxUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

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
    setCompany("");
    setComment("");
    setPercentRate(0);
    setTaxRate(0);
    setCommissionUserId(null);
    setTaxUserId(null);
    setItems([]);
  };

  const companyBillingSetting = billingSettingForCompany(companySettings, company);

  useEffect(() => {
    if (!show) return;
    setPercentRate(Number(companyBillingSetting?.default_percent_rate) || 0);
    setTaxRate(Number(companyBillingSetting?.default_tax_rate) || 0);
    setCommissionUserId(companyBillingSetting?.default_commission_user_id ?? null);
    setTaxUserId(companyBillingSetting?.default_tax_user_id ?? null);
  }, [show, companyBillingSetting]);

  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const taxCommissionMode = taxCommissionModeForCompany(companySettings, company);
  const combinedRate = percentRate + taxRate;
  const divisor = combinedRate < 100 ? 1 - combinedRate / 100 : 0;
  const calcTotal = taxCommissionMode === "included"
    ? itemsTotal
    : (divisor > 0 ? Math.round(itemsTotal / divisor) : 0);
  const calcPercent = Math.round(calcTotal * percentRate / 100);
  const calcTax = Math.round(calcTotal * taxRate / 100);
  const recipientErrors = hasInvoiceRecipientErrors({
    commissionAmount: calcPercent,
    taxAmount: calcTax,
    commissionUserId,
    taxUserId,
  });
  const hasRecipientErrors = recipientErrors.commission || recipientErrors.tax;

  const handleSubmit = async () => {
    if (items.length === 0 || itemsTotal <= 0 || hasRecipientErrors) return;
    setLoading(true);
    try {
      const body = {
        invoice_number: invoiceNumber || undefined,
        company: company || undefined,
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
      const res = await adminRequest("/admin/invoices", {
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

  const companyOptions = [
    { value: "", label: "Не указана" },
    ...companies.map((row) => ({ value: row.company, label: row.company })),
  ];

  return (
    <Modal
      data-eopp-component="InvoiceCreateModal"
      title="Новый счет"
      open={show}
      onCancel={onClose}
      width={1040}
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
          disabled={items.length === 0 || itemsTotal <= 0 || hasRecipientErrors}
        >
          Создать
        </Button>,
      ]}
    >
      <div className="invoice-modal">
        <section className="invoice-modal__section invoice-modal__section--compact">
          <div className="invoice-modal__section-title">Основное</div>
          <div className="invoice-modal__form-grid invoice-modal__form-grid--single">
          <label className="form-label small mb-0">
            Номер счета
            <TextInput
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="Авто, если пусто"
            />
          </label>
          <label className="form-label small mb-0">
            Компания
            <SelectInput
              value={company}
              onChange={(value) => setCompany(value || "")}
              options={companyOptions}
              allowClear={false}
            />
          </label>
          </div>
        </section>

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

        <InvoiceAccountingTable
          users={users}
          debtAmount={itemsTotal}
          debtLabel="Строки счета"
          commissionRate={percentRate}
          taxRate={taxRate}
          commissionAmount={calcPercent}
          taxAmount={calcTax}
          totalAmount={calcTotal}
          commissionUserId={commissionUserId}
          taxUserId={taxUserId}
          onCommissionRateChange={setPercentRate}
          onTaxRateChange={setTaxRate}
          onCommissionChange={setCommissionUserId}
          onTaxChange={setTaxUserId}
          componentPrefix="InvoiceCreate"
        />

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
