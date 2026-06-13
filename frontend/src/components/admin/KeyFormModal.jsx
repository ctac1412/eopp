import React from "react";
import { Checkbox, InputNumber, Modal, Space } from "antd";
import { Button, SelectInput, TextInput } from "../../ui";

export function KeyFormModal({
  show,
  mode,
  form,
  setForm,
  onSubmit,
  onClose,
  onResetUsage,
  onDeleteKey,
  users = [],
}) {
  const handleSubmit = (event) => {
    event?.preventDefault?.();
    onSubmit(event);
  };

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const renderNumberInput = ({ component, field, placeholder, min = 0 }) => (
    <InputNumber
      data-eopp-component={component}
      className="key-form-number"
      value={form[field] === "" || form[field] == null ? null : Number(form[field])}
      onChange={(value) => setField(field, value == null ? "" : String(value))}
      placeholder={placeholder}
      min={min}
      controls={false}
    />
  );

  return (
    <Modal
      data-eopp-component="KeyFormModal"
      title={mode === "create" ? "Создать новый ключ" : "Редактировать ключ"}
      open={!!show}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={mode === "create" ? "Создать" : "Сохранить"}
      cancelText="Отмена"
      width={mode === "edit" ? 820 : 560}
      destroyOnClose
      footer={(_, { OkBtn, CancelBtn }) => (
        <div className="key-form-footer">
          {mode === "edit" ? (
            <Space size={6}>
              <Button size="small" onClick={() => onResetUsage()}>Сбросить использование</Button>
              <Button size="small" variant="danger" onClick={() => onDeleteKey()}>Удалить ключ</Button>
            </Space>
          ) : <span />}
          <Space size={6}>
            <CancelBtn />
            <OkBtn />
          </Space>
        </div>
      )}
    >
      <form data-eopp-component="KeyForm" className="key-form-grid" onSubmit={handleSubmit}>
        <label className="form-label mb-0">
          Label
          <TextInput
            value={form.label}
            onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
            placeholder={mode === "create" ? "напр. production" : ""}
            required={mode === "create"}
          />
        </label>

        {mode === "edit" ? (
          <label className="form-label mb-0">
            Комментарий
            <TextInput
              value={form.comment}
              onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
            />
          </label>
        ) : null}

        <label className="form-label mb-0">
          Пользователь
          <SelectInput
            value={form.userId || ""}
            onChange={(value) => setForm((prev) => ({ ...prev, userId: value || "" }))}
            options={users.map((user) => ({
                value: String(user.id),
                label: `${user.name || user.login || `#${user.id}`}${user.company_name ? ` · ${user.company_name}` : ""}`,
              }))}
            allowClear={false}
            placeholder="Выберите владельца ключа"
          />
        </label>

        <label className="form-label mb-0">
          Max Uses
          {renderNumberInput({
            component: "KeyMaxUsesInput",
            field: "maxUses",
            placeholder: "∞",
            min: 1,
          })}
        </label>

        <div className="key-form-checks">
          {mode === "edit" ? (
            <Checkbox
              data-eopp-component="KeyActiveCheckbox"
              checked={form.active}
              onChange={(event) => setField("active", event.target.checked)}
            >
              Активен
            </Checkbox>
          ) : null}
          <Checkbox
            data-eopp-component="KeyExternalCheckbox"
            checked={form.isExternal || false}
            onChange={(event) => setField("isExternal", event.target.checked)}
          >
            Внешний клиент
          </Checkbox>
        </div>

        {mode === "edit" ? (
          <div className="key-form-tariff">
            <div className="fw-semibold">Тариф</div>
            <div className="key-form-tariff-grid">
              <label className="form-label mb-0">
                Бронь
                {renderNumberInput({
                  component: "KeyPriceCreateInput",
                  field: "priceCreate",
                  placeholder: "1000",
                })}
              </label>
              <label className="form-label mb-0">
                Перенос
                {renderNumberInput({
                  component: "KeyPriceRescheduleInput",
                  field: "priceReschedule",
                  placeholder: "7000",
                })}
              </label>
              <label className="form-label mb-0">
                Бронь 12:00
                {renderNumberInput({
                  component: "KeyPriceCreatePeakInput",
                  field: "priceCreatePeak",
                  placeholder: "как перенос",
                })}
              </label>
              <label className="form-label mb-0">
                Свои слоты
                {renderNumberInput({
                  component: "KeyPriceCustomSlotsInput",
                  field: "priceCustomSlots",
                  placeholder: "0",
                })}
              </label>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

export function DeleteConfirmModal({ show, onConfirm, onClose }) {
  return (
    <Modal
      data-eopp-component="DeleteConfirmModal"
      title="Подтверждение"
      open={!!show}
      onCancel={onClose}
      onOk={onConfirm}
      okText="Удалить"
      okButtonProps={{ danger: true }}
      cancelText="Отмена"
      width={420}
      destroyOnClose
    >
      <p className="mb-0">Вы уверены, что хотите удалить этот ключ? Это действие нельзя отменить.</p>
    </Modal>
  );
}
