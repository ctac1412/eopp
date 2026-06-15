import React, { useEffect, useState } from "react";
import { Input, InputNumber, Modal } from "antd";
import { formatMoney } from "../../../utils/format";
import { Button, DataTable } from "../../../ui";
import { InvoiceRecipientFields, hasInvoiceRecipientErrors } from "./InvoiceRecipientFields";

const DEFAULT_COMMISSION_RATE = 5;
const DEFAULT_TAX_RATE = 6;

function formatDate(value) {
  return value ? String(value).substring(0, 10) : "-";
}

function getOperationLabel(log) {
  return log.op_type === "reschedule" ? "Перенос" : "Создание";
}

export function InvoiceModal({ show, selectedLogs = [], onGenerate, onClose, users = [] }) {
  const [debtAmount, setDebtAmount] = useState(0);
  const [percentRate, setPercentRate] = useState(DEFAULT_COMMISSION_RATE);
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE);
  const [commissionUserId, setCommissionUserId] = useState(null);
  const [taxUserId, setTaxUserId] = useState(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    const sum = selectedLogs.reduce((acc, log) => acc + (Number(log.price) || 0), 0);
    setDebtAmount(sum);
  }, [selectedLogs]);

  useEffect(() => {
    if (show) {
      setPercentRate(DEFAULT_COMMISSION_RATE);
      setTaxRate(DEFAULT_TAX_RATE);
      setCommissionUserId(null);
      setTaxUserId(null);
      setComment("");
    }
  }, [show]);

  const combinedRate = percentRate + taxRate;
  const divisor = combinedRate < 100 ? 1 - combinedRate / 100 : 0;
  const totalAmount = divisor > 0 ? Math.round(debtAmount / divisor) : 0;
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
      title: "Бронь",
      dataIndex: "reservation_id",
      width: 160,
      ellipsis: true,
      render: (value) => value || "-",
    },
    { title: "Тип", width: 96, render: (_, log) => getOperationLabel(log) },
    {
      title: "Цена",
      dataIndex: "price",
      width: 96,
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
      width={860}
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
          disabled={selectedLogs.length === 0 || totalAmount <= 0 || hasRecipientErrors}
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
          <DataTable
            className="invoice-modal__table"
            rowKey="id"
            data={selectedLogs}
            columns={columns}
            emptyText="Нет выбранных записей"
            pagination={false}
            scroll={{ x: 560, y: 220 }}
          />
        </section>

        <section className="invoice-modal__section invoice-modal__section--compact">
          <div className="invoice-modal__section-title">Суммы</div>
          <div className="invoice-modal__grid">
          <div className="invoice-modal__summary">
            <span className="text-muted">Сумма долга</span>
            <strong>{formatMoney(debtAmount)}</strong>
          </div>
          <label className="form-label small mb-0">
            Комиссия, %
            <InputNumber
              data-eopp-component="InvoicePercentRateInput"
              size="small"
              min={0}
              max={99}
              step={0.01}
              value={percentRate}
              onChange={(value) => setPercentRate(Number(value) || 0)}
              className="invoice-modal__number"
            />
            <span className="text-muted">{formatMoney(percentAmount)} от итого</span>
          </label>
          <label className="form-label small mb-0">
            Налог, %
            <InputNumber
              data-eopp-component="InvoiceTaxRateInput"
              size="small"
              min={0}
              max={99}
              step={0.01}
              value={taxRate}
              onChange={(value) => setTaxRate(Number(value) || 0)}
              className="invoice-modal__number"
            />
            <span className="text-muted">{formatMoney(taxAmount)} от итого</span>
          </label>
          <div className="invoice-modal__summary invoice-modal__summary--total">
            <span>Итого</span>
            <strong>{formatMoney(totalAmount)}</strong>
          </div>
          </div>
        </section>

        <InvoiceRecipientFields
          users={users}
          commissionAmount={percentAmount}
          taxAmount={taxAmount}
          commissionUserId={commissionUserId}
          taxUserId={taxUserId}
          onCommissionChange={setCommissionUserId}
          onTaxChange={setTaxUserId}
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
