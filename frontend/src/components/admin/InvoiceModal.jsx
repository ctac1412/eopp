import React, { useState, useEffect, useMemo } from "react";

export function InvoiceModal({ show, selectedLogs, form, setForm, onGenerate, onClose }) {
  const [debtAmount, setDebtAmount] = useState(0);
  const [percentRate, setPercentRate] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [percentAmount, setPercentAmount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    if (!selectedLogs || selectedLogs.length === 0) {
      setDebtAmount(0);
      return;
    }
    const sum = selectedLogs.reduce((acc, log) => acc + (log.price || 0), 0);
    setDebtAmount(sum);
  }, [selectedLogs]);

  useEffect(() => {
    const combinedRate = percentRate + taxRate;
    if (combinedRate >= 100) {
      setTotalAmount(0);
      setPercentAmount(0);
      setTaxAmount(0);
      return;
    }

    const divisor = 1 - combinedRate / 100;
    const total = divisor > 0 ? Math.round(debtAmount / divisor) : 0;

    const pAmount = Math.round(total * percentRate / 100);
    const tAmount = Math.round(total * taxRate / 100);

    setPercentAmount(pAmount);
    setTaxAmount(tAmount);
    setTotalAmount(total);
  }, [debtAmount, percentRate, taxRate]);

  const handleGenerate = () => {
    onGenerate({
      percentRate,
      taxRate,
      percentAmount,
      taxAmount,
      totalAmount,
      logs: selectedLogs,
    });
  };

  if (!show) return null;

  return (
    <div className="modal__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal--lg" onClick={(e) => e.stopPropagation()}>
        <h3>Генерация счёта</h3>

        <div className="invoice-logs-list">
          <div className="invoice-logs-title">Выбранные записи ({selectedLogs.length}):</div>
          <div className="invoice-logs-table">
            <div className="invoice-logs-header">
              <div className="invoice-logs-cell invoice-logs-cell--num">№</div>
              <div className="invoice-logs-cell invoice-logs-cell--date">Дата</div>
              <div className="invoice-logs-cell invoice-logs-cell--reservation">Reservation ID</div>
              <div className="invoice-logs-cell invoice-logs-cell--type">Тип</div>
              <div className="invoice-logs-cell invoice-logs-cell--price">Цена</div>
            </div>
            {selectedLogs.map((log, i) => {
              const config = log.config_json || {};
              const mode = config.mode || "create";
              const opType = mode === "reschedule" ? "Перенос" : "Создание";
              return (
                <div className="invoice-logs-row" key={log.id}>
                  <div className="invoice-logs-cell invoice-logs-cell--num">{i + 1}</div>
                  <div className="invoice-logs-cell invoice-logs-cell--date">{(log.created_at || "").substring(0, 10)}</div>
                  <div className="invoice-logs-cell invoice-logs-cell--reservation">{(log.reservation_id || "").substring(0, 20)}</div>
                  <div className="invoice-logs-cell invoice-logs-cell--type">{opType}</div>
                  <div className="invoice-logs-cell invoice-logs-cell--price">{log.price || 0} ₽</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="invoice-totals">
          <div className="invoice-total-row">
            <span className="invoice-total-label">Сумма долга:</span>
            <span className="invoice-total-value">{debtAmount} ₽</span>
          </div>

          <div className="invoice-rates-table">
            <div className="invoice-rates-header">
              <div className="invoice-rates-col invoice-rates-col--label">Ставка</div>
              <div className="invoice-rates-col invoice-rates-col--input">Сумма</div>
            </div>
            <div className="invoice-rates-row">
              <div className="invoice-rates-col invoice-rates-col--label">
                Комиссия:
                <input
                  type="number"
                  step="0.01"
                  className="input invoice-rate-input"
                  value={percentRate}
                  onChange={(e) => setPercentRate(parseFloat(e.target.value) || 0)}
                />
                <span className="invoice-rate-percent">%</span>
              </div>
              <div className="invoice-rates-col invoice-rates-col--value">
                <span className="invoice-rate-sum">{percentAmount} ₽</span>
                <span className="invoice-rate-note">от ИТОГО</span>
              </div>
            </div>
            <div className="invoice-rates-row">
              <div className="invoice-rates-col invoice-rates-col--label">
                Налог:
                <input
                  type="number"
                  step="0.01"
                  className="input invoice-rate-input"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                />
                <span className="invoice-rate-percent">%</span>
              </div>
              <div className="invoice-rates-col invoice-rates-col--value">
                <span className="invoice-rate-sum">{taxAmount} ₽</span>
                <span className="invoice-rate-note">от ИТОГО</span>
              </div>
            </div>
          </div>

          <div className="invoice-total-row invoice-total-row--total">
            <span className="invoice-total-label">ИТОГО:</span>
            <span className="invoice-total-value">{totalAmount} ₽</span>
          </div>
        </div>

        <div className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleGenerate}
            disabled={selectedLogs.length === 0 || totalAmount <= 0}
          >
            Сформировать счёт
          </button>
        </div>
      </div>
    </div>
  );
}
