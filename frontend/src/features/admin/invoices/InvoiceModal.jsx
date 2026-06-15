import React, { useEffect, useState } from "react";
import { Input, Modal } from "antd";
import { formatMoney } from "../../../utils/format";
import { Button, DataTable } from "../../../ui";
import { InvoiceAccountingTable, hasInvoiceRecipientErrors } from "./InvoiceRecipientFields";

function formatDate(value) {
  return value ? String(value).substring(0, 10) : "-";
}

function getOperationLabel(log) {
  return log.op_type === "reschedule" ? "Перенос" : "Создание";
}

function getCompanyLabel(log) {
  return log.company_name || log.company || (log.company_id != null ? `Компания #${log.company_id}` : "Не указана");
}

function normalizeTaxCommissionMode(mode) {
  return mode === "included" ? "included" : "added";
}

function getTaxCommissionMode(companySettings, company) {
  return normalizeTaxCommissionMode(
    companySettings.find((setting) => setting.company === company)?.tax_commission_mode,
  );
}

function getCompanyBillingSetting(companySettings, company) {
  return companySettings.find((setting) => setting.company === company) || null;
}

export function InvoiceModal({
  show,
  selectedLogs = [],
  onGenerate,
  onClose,
  users = [],
  companySettings = [],
}) {
  const [debtAmount, setDebtAmount] = useState(0);
  const [percentRate, setPercentRate] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [commissionUserId, setCommissionUserId] = useState(null);
  const [taxUserId, setTaxUserId] = useState(null);
  const [comment, setComment] = useState("");

  const selectedCompanies = [...new Set(selectedLogs.map(getCompanyLabel))];
  const hasMixedCompanies = selectedCompanies.length > 1;
  const selectedCompany = hasMixedCompanies ? null : selectedCompanies[0];
  const companyBillingSetting = getCompanyBillingSetting(companySettings, selectedCompany);

  useEffect(() => {
    const sum = selectedLogs.reduce((acc, log) => acc + (Number(log.price) || 0), 0);
    setDebtAmount(sum);
  }, [selectedLogs]);

  useEffect(() => {
    if (show) {
      setComment("");
    }
  }, [show]);

  useEffect(() => {
    if (!show) return;
    setPercentRate(Number(companyBillingSetting?.default_percent_rate) || 0);
    setTaxRate(Number(companyBillingSetting?.default_tax_rate) || 0);
    setCommissionUserId(companyBillingSetting?.default_commission_user_id ?? null);
    setTaxUserId(companyBillingSetting?.default_tax_user_id ?? null);
  }, [show, companyBillingSetting]);

  const taxCommissionMode = hasMixedCompanies
    ? "added"
    : getTaxCommissionMode(companySettings, selectedCompany);
  const combinedRate = percentRate + taxRate;
  const divisor = combinedRate < 100 ? 1 - combinedRate / 100 : 0;
  const totalAmount =
    taxCommissionMode === "included"
      ? debtAmount
      : divisor > 0
        ? Math.round(debtAmount / divisor)
        : 0;
  const percentAmount = Math.round(totalAmount * percentRate / 100);
  const taxAmount = Math.round(totalAmount * taxRate / 100);
  const recipientErrors = hasInvoiceRecipientErrors({
    commissionAmount: percentAmount,
    taxAmount,
    commissionUserId,
    taxUserId,
  });
  const hasRecipientErrors = recipientErrors.commission || recipientErrors.tax;

  const columns = [
    { title: "#", width: 44, render: (_, __, index) => index + 1 },
    { title: "Дата", dataIndex: "created_at", width: 96, render: formatDate },
    {
      title: "Компания",
      width: 220,
      render: (_, log) => <span title={getCompanyLabel(log)}>{getCompanyLabel(log)}</span>,
    },
    {
      title: "Бронь",
      dataIndex: "reservation_id",
      width: 430,
      render: (value) => <span className="font-monospace text-nowrap">{value || "-"}</span>,
    },
    { title: "Тип", width: 140, render: (_, log) => getOperationLabel(log) },
    {
      title: "Цена",
      dataIndex: "price",
      width: 130,
      align: "right",
      render: (value) => formatMoney(value),
    },
  ];

  const handleGenerate = () => {
    onGenerate({
      percentRate,
      taxRate,
      percentAmount,
      taxAmount,
      totalAmount,
      commissionUserId,
      taxUserId,
      comment,
      logs: selectedLogs,
    });
  };

  return (
    <Modal
      data-eopp-component="InvoiceModal"
      title="Сформировать счет"
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
          onClick={handleGenerate}
          disabled={selectedLogs.length === 0 || totalAmount <= 0 || hasRecipientErrors || hasMixedCompanies}
        >
          Сформировать счет
        </Button>,
      ]}
    >
      <div className="invoice-modal">
        <section className="invoice-modal__section">
          <div className="invoice-modal__section-title">
            Выбранные записи <span className="text-muted">({selectedLogs.length})</span>
          </div>
          {hasMixedCompanies ? (
            <div className="invoice-modal__warning">
              В одном счете нельзя смешивать компании: {selectedCompanies.join(", ")}
            </div>
          ) : null}
          <DataTable
            className="invoice-modal__table"
            rowKey="id"
            data={selectedLogs}
            columns={columns}
            emptyText="Нет выбранных записей"
            pagination={false}
            scroll={false}
          />
        </section>

        <InvoiceAccountingTable
          users={users}
          debtAmount={debtAmount}
          debtLabel="Выбранные записи"
          commissionRate={percentRate}
          taxRate={taxRate}
          commissionAmount={percentAmount}
          taxAmount={taxAmount}
          totalAmount={totalAmount}
          commissionUserId={commissionUserId}
          taxUserId={taxUserId}
          onCommissionRateChange={setPercentRate}
          onTaxRateChange={setTaxRate}
          onCommissionChange={setCommissionUserId}
          onTaxChange={setTaxUserId}
          componentPrefix="Invoice"
        />

        <label className="form-label small mb-0 invoice-modal__comment">
          Комментарий
          <Input.TextArea
            data-eopp-component="InvoiceCommentInput"
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Необязательно"
          />
        </label>
      </div>
    </Modal>
  );
}
