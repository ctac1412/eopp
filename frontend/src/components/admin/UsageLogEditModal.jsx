import React from "react";
import { InputNumber, Modal } from "antd";
import { Button, SelectInput } from "../../ui";

export function UsageLogEditModal({ show, entry, form, setForm, onSubmit, onClose }) {
  if (!entry) return null;

  const handleSubmit = () => {
    onSubmit({ preventDefault: () => {} });
  };

  return (
    <Modal
      data-eopp-component="UsageLogEditModal"
      title={`Редактировать запись #${entry.id}`}
      open={show}
      onCancel={onClose}
      width={420}
      destroyOnClose
      footer={[
        <Button key="cancel" size="small" onClick={onClose}>
          Отмена
        </Button>,
        <Button key="submit" size="small" variant="primary" onClick={handleSubmit}>
          Сохранить
        </Button>,
      ]}
    >
      <div className="usage-log-edit-modal">
        <label className="form-label small mb-0">
          Цена, ₽
          <InputNumber
            data-eopp-component="UsageLogEditPriceInput"
            min={0}
            value={form.price === "" ? null : Number(form.price)}
            onChange={(value) => setForm((prev) => ({ ...prev, price: value == null ? "" : String(value) }))}
            className="usage-log-edit-modal__control"
          />
        </label>
        <label className="form-label small mb-0">
          Оплата
          <SelectInput
            value={form.paid}
            onChange={(value) => setForm((prev) => ({ ...prev, paid: value ?? "" }))}
            options={[
              { value: "", label: "Не задано" },
              { value: "true", label: "Оплачено" },
              { value: "false", label: "Не оплачено" },
            ]}
            allowClear={false}
            className="usage-log-edit-modal__control"
          />
        </label>
      </div>
    </Modal>
  );
}
