import React from "react";
import { InputNumber } from "antd";
import { formatMoney } from "../../../utils/format";
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

export function InvoiceAccountingTable({
  users = [],
  debtAmount = 0,
  debtEditable = false,
  debtLabel = "По строкам",
  onDebtChange,
  commissionRate = 0,
  taxRate = 0,
  commissionAmount = 0,
  taxAmount = 0,
  totalAmount = 0,
  commissionUserId,
  taxUserId,
  onCommissionRateChange,
  onTaxRateChange,
  onCommissionChange,
  onTaxChange,
  componentPrefix = "Invoice",
}) {
  const userOptions = getInvoiceUserOptions(users);
  const errors = hasInvoiceRecipientErrors({ commissionAmount, taxAmount, commissionUserId, taxUserId });

  const recipientSelect = ({ value, onChange, error, placeholder, component }) => (
    <div className="invoice-accounting-table__recipient">
      <SelectInput
        data-eopp-component={component}
        value={value ?? ""}
        onChange={(nextValue) => onChange?.(nextValue ? Number(nextValue) : null)}
        options={userOptions}
        allowClear={false}
        status={error ? "error" : undefined}
        placeholder={placeholder}
      />
      {error ? <span className="invoice-modal__field-error">Обязательно</span> : null}
    </div>
  );

  return (
    <section className="invoice-modal__section invoice-modal__section--compact">
      <div className="invoice-modal__section-title">Бухгалтерия счета</div>
      <div className="invoice-accounting-table">
        <div className="invoice-accounting-table__head">
          <span>Операция</span>
          <span>База / ставка</span>
          <span>Получатель</span>
          <span>Сумма</span>
        </div>

        <div className="invoice-accounting-table__row">
          <div className="invoice-accounting-table__operation">
            <strong>Долг</strong>
            <span>{debtLabel}</span>
          </div>
          <div>
            {debtEditable ? (
              <InputNumber
                data-eopp-component={`${componentPrefix}DebtAmount`}
                size="small"
                min={0}
                value={debtAmount}
                onChange={(value) => onDebtChange?.(Number(value) || 0)}
                addonAfter="₽"
                className="invoice-modal__amount-input"
              />
            ) : (
              <span className="invoice-accounting-table__basis">основная сумма</span>
            )}
          </div>
          <span className="invoice-accounting-table__muted">—</span>
          <strong className="invoice-accounting-table__amount">{formatMoney(debtAmount)}</strong>
        </div>

        <div className="invoice-accounting-table__row">
          <div className="invoice-accounting-table__operation">
            <strong>Комиссия</strong>
            <span>{Number(commissionAmount || 0) > 0 ? "получатель обязателен" : "не начисляется"}</span>
          </div>
          <InputNumber
            data-eopp-component={`${componentPrefix}PercentRate`}
            size="small"
            min={0}
            max={99}
            step={0.01}
            value={commissionRate}
            onChange={(value) => onCommissionRateChange?.(Number(value) || 0)}
            addonAfter="%"
            className="invoice-modal__number"
          />
          {recipientSelect({
            value: commissionUserId,
            onChange: onCommissionChange,
            error: errors.commission,
            placeholder: "Получатель комиссии",
            component: `${componentPrefix}CommissionUserSelect`,
          })}
          <strong className="invoice-accounting-table__amount">{formatMoney(commissionAmount)}</strong>
        </div>

        <div className="invoice-accounting-table__row">
          <div className="invoice-accounting-table__operation">
            <strong>Налог</strong>
            <span>{Number(taxAmount || 0) > 0 ? "получатель обязателен" : "не начисляется"}</span>
          </div>
          <InputNumber
            data-eopp-component={`${componentPrefix}TaxRate`}
            size="small"
            min={0}
            max={99}
            step={0.01}
            value={taxRate}
            onChange={(value) => onTaxRateChange?.(Number(value) || 0)}
            addonAfter="%"
            className="invoice-modal__number"
          />
          {recipientSelect({
            value: taxUserId,
            onChange: onTaxChange,
            error: errors.tax,
            placeholder: "Получатель налога",
            component: `${componentPrefix}TaxUserSelect`,
          })}
          <strong className="invoice-accounting-table__amount">{formatMoney(taxAmount)}</strong>
        </div>

        <div className="invoice-accounting-table__row invoice-accounting-table__row--total">
          <div className="invoice-accounting-table__operation">
            <strong>Итого к оплате</strong>
            <span>долг + начисления</span>
          </div>
          <span className="invoice-accounting-table__muted">—</span>
          <span className="invoice-accounting-table__muted">—</span>
          <strong className="invoice-accounting-table__amount">{formatMoney(totalAmount)}</strong>
        </div>
      </div>
    </section>
  );
}
