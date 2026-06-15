import React, { useEffect, useState } from "react";
import { Input, Modal } from "antd";

import { SelectInput, TextInput } from "../../../ui";
import { FINANCE_KIND_LABELS } from "./financeFormat.js";

const EMPTY_FORM = {
  company_id: "",
  usage_log_id: "",
  invoice_id: "",
  expense_id: "",
  profit_lot_id: "",
  distribution_answer_id: "",
  user_id: "",
  kind: "manual_adjustment",
  amount: "",
  comment: "",
};

const RELATION_FIELDS = [
  "company_id",
  "usage_log_id",
  "invoice_id",
  "expense_id",
  "profit_lot_id",
  "distribution_answer_id",
  "user_id",
];

function valueForInput(value) {
  return value === null || value === undefined ? "" : String(value);
}

export function financeEntryPayload(form) {
  const payload = {
    kind: form.kind || "manual_adjustment",
    amount: Number(form.amount) || 0,
    comment: form.comment || "",
  };
  RELATION_FIELDS.forEach((field) => {
    payload[field] = form[field] === "" || form[field] === null || form[field] === undefined
      ? null
      : Number(form[field]);
  });
  return payload;
}

export function FinanceEntryModal({ open, entry, companies = [], participants = [], onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(
      entry
        ? {
            company_id: valueForInput(entry.company_id),
            usage_log_id: valueForInput(entry.usage_log_id),
            invoice_id: valueForInput(entry.invoice_id),
            expense_id: valueForInput(entry.expense_id),
            profit_lot_id: valueForInput(entry.profit_lot_id),
            distribution_answer_id: valueForInput(entry.distribution_answer_id),
            user_id: valueForInput(entry.user_id),
            kind: entry.kind || "manual_adjustment",
            amount: valueForInput(entry.amount),
            comment: entry.comment || "",
          }
        : EMPTY_FORM,
    );
  }, [entry, open]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value ?? "" }));
  const handleOk = () => onSubmit(financeEntryPayload(form), entry);
  const kindOptions = Object.entries(FINANCE_KIND_LABELS).map(([value, label]) => ({ value, label }));
  const companyOptions = companies.map((company) => ({ value: String(company.id), label: company.name || `#${company.id}` }));
  const participantOptions = participants.map((user) => ({ value: String(user.id), label: user.name || `#${user.id}` }));

  return (
    <Modal
      data-eopp-component="FinanceEntryModal"
      title={entry ? `Проводка #${entry.id}` : "Новая корректировка"}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="Сохранить"
      cancelText="Отмена"
      width="min(720px, 96vw)"
      destroyOnHidden
    >
      <form
        data-eopp-component="FinanceEntryModalForm"
        className="finance-entry-form"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          handleOk();
        }}
      >
        <label className="form-label small mb-0">
          Компания
          <SelectInput
            value={form.company_id || undefined}
            onChange={(value) => setField("company_id", value)}
            options={companyOptions}
            placeholder="Не указана"
            allowClear
          />
        </label>
        <label className="form-label small mb-0">
          Участник
          <SelectInput
            value={form.user_id || undefined}
            onChange={(value) => setField("user_id", value)}
            options={participantOptions}
            placeholder="Не указан"
            allowClear
          />
        </label>
        <label className="form-label small mb-0">
          Тип
          <SelectInput
            value={form.kind}
            onChange={(value) => setField("kind", value)}
            options={kindOptions}
            allowClear={false}
          />
        </label>
        <label className="form-label small mb-0">
          Сумма
          <TextInput
            type="number"
            value={form.amount}
            onChange={(event) => setField("amount", event.target.value)}
            required
          />
        </label>
        {RELATION_FIELDS.filter((field) => field !== "company_id" && field !== "user_id").map((field) => (
          <label className="form-label small mb-0" key={field}>
            {field}
            <TextInput
              type="number"
              value={form[field]}
              onChange={(event) => setField(field, event.target.value)}
              min="0"
            />
          </label>
        ))}
        <label className="form-label small mb-0 finance-entry-form__comment" style={{ gridColumn: "1 / -1" }}>
          Комментарий
          <Input.TextArea
            value={form.comment}
            onChange={(event) => setField("comment", event.target.value)}
            rows={3}
            placeholder="Причина ручной корректировки"
          />
        </label>
      </form>
    </Modal>
  );
}
