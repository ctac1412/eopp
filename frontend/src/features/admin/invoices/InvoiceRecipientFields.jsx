import React from "react";
import { SelectInput } from "../../../ui";

export function getInvoiceUserOptions(users = []) {
  return [
    { value: "", label: "Не указан" },
    ...users.map((user) => ({ value: user.id, label: user.name })),
  ];
}

export function hasInvoiceRecipientErrors({ commissionAmount, taxAmount, commissionUserId, taxUserId }) {
  return {
    commission: Number(commissionAmount || 0) > 0 && !commissionUserId,
    tax: Number(taxAmount || 0) > 0 && !taxUserId,
  };
}

export function InvoiceRecipientFields({
  users = [],
  commissionAmount = 0,
  taxAmount = 0,
  commissionUserId,
  taxUserId,
  onCommissionChange,
  onTaxChange,
}) {
  const userOptions = getInvoiceUserOptions(users);
  const errors = hasInvoiceRecipientErrors({ commissionAmount, taxAmount, commissionUserId, taxUserId });

  return (
    <section className="invoice-modal__section invoice-modal__section--compact">
      <div className="invoice-modal__section-title">
        <span>Получатели начислений</span>
        <span className="text-muted">обязательны при суммах комиссии и налога</span>
      </div>
      <div className="invoice-modal__recipients-grid">
        <label className="form-label small mb-0">
          Комиссию получает{Number(commissionAmount || 0) > 0 ? " *" : ""}
          <SelectInput
            data-eopp-component="InvoiceCommissionUserSelect"
            value={commissionUserId ?? ""}
            onChange={(value) => onCommissionChange?.(value ? Number(value) : null)}
            options={userOptions}
            allowClear={false}
            status={errors.commission ? "error" : undefined}
          />
          {errors.commission ? <span className="invoice-modal__field-error">Выберите получателя комиссии</span> : null}
        </label>
        <label className="form-label small mb-0">
          Налог платит{Number(taxAmount || 0) > 0 ? " *" : ""}
          <SelectInput
            data-eopp-component="InvoiceTaxUserSelect"
            value={taxUserId ?? ""}
            onChange={(value) => onTaxChange?.(value ? Number(value) : null)}
            options={userOptions}
            allowClear={false}
            status={errors.tax ? "error" : undefined}
          />
          {errors.tax ? <span className="invoice-modal__field-error">Выберите получателя налога</span> : null}
        </label>
      </div>
    </section>
  );
}
