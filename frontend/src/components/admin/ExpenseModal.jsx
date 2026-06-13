import React from "react";
import { Input, Modal } from "antd";
import { SelectInput, TextInput } from "../../ui";

function formatDateForInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseInputDate(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function ExpenseModal({ show, form, setForm, onSubmit, onClose, users }) {
  const handleOk = (event) => {
    event?.preventDefault?.();
    onSubmit(event || { preventDefault() {} });
  };

  return (
    <Modal
      data-eopp-component="ExpenseModal"
      title={form.id ? "Редактировать расход" : "Новый расход"}
      open={!!show}
      onOk={handleOk}
      onCancel={onClose}
      okText="Сохранить"
      cancelText="Отмена"
      destroyOnHidden
    >
      <form data-eopp-component="ExpenseModalForm" className="expenses-modal-form" onSubmit={handleOk}>
        <label className="form-label small mb-0">
          Сумма
          <TextInput
            type="number"
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            min="0"
            required
          />
        </label>
        <label className="form-label small mb-0">
          Причина
          <TextInput
            value={form.reason}
            onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Например: аренда, сервис, комиссия"
            required
          />
        </label>
        <label className="form-label small mb-0">
          Кто понёс
          <SelectInput
            value={form.user_id ?? undefined}
            onChange={(value) => setForm((prev) => ({ ...prev, user_id: value || null }))}
            options={users.map((user) => ({ value: user.id, label: user.name }))}
            placeholder="Не указан"
          />
        </label>
        <label className="form-label small mb-0">
          Дата
          <TextInput
            data-eopp-component="ExpenseCreatedAtInput"
            type="datetime-local"
            value={form.created_at ? formatDateForInput(form.created_at) : formatDateForInput(new Date().toISOString())}
            onChange={(event) => setForm((prev) => ({ ...prev, created_at: parseInputDate(event.target.value) }))}
          />
        </label>
        <label className="form-label small mb-0">
          Комментарий
          <Input.TextArea
            data-eopp-component="ExpenseCommentTextarea"
            value={form.comment}
            onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
            className="expenses-textarea"
            rows={3}
            placeholder="Детали расхода"
          />
        </label>
      </form>
    </Modal>
  );
}
