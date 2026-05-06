import React, { useState, useEffect, useMemo } from "react";

export function InvoiceModal({ show, withdrawals, selectedLogs, form, setForm, onGenerate, onClose }) {
  const [debtAmount, setDebtAmount] = useState(0);
  const [percentAmount, setPercentAmount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  const selectedWithdrawal = useMemo(() => {
    return withdrawals.find((w) => String(w.id) === String(form.withdrawalId)) || null;
  }, [withdrawals, form.withdrawalId]);

  useEffect(() => {
    if (!selectedLogs || selectedLogs.length === 0) {
      setDebtAmount(0);
      return;
    }
    const sum = selectedLogs.reduce((acc, log) => acc + (log.price || 0), 0);
    setDebtAmount(sum);
  }, [selectedLogs]);

  useEffect(() => {
    if (!selectedWithdrawal) {
      setPercentAmount(0);
      setTaxAmount(0);
      setTotalAmount(debtAmount);
      return;
    }

    const pct = selectedWithdrawal.percent || 0;
    const taxPct = selectedWithdrawal.tax_percent || 0;
    const percentType = selectedWithdrawal.percent_type || "included";

    const newPercentAmount = percentType === "included" ? Math.round(debtAmount * pct / 100) : 0;
    const newTaxAmount = Math.round((debtAmount + newPercentAmount) * taxPct / 100);
    const newTotal = debtAmount + newPercentAmount + newTaxAmount;

    setPercentAmount(newPercentAmount);
    setTaxAmount(newTaxAmount);
    setTotalAmount(newTotal);
  }, [debtAmount, selectedWithdrawal]);

  const handleGenerate = () => {
    onGenerate({
      withdrawalId: form.withdrawalId,
      debtAmount,
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

        <div className="form-group">
          <label className="form-label">Способ вывода</label>
          <select
            value={form.withdrawalId}
            onChange={(e) => setForm((p) => ({ ...p, withdrawalId: e.target.value }))}
            className="input select"
            required
          >
            <option value="">Выберите получателя</option>
            {withdrawals.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.percent}%, налог {w.tax_percent || 0}%)
              </option>
            ))}
          </select>
        </div>

        {selectedWithdrawal && (
          <div className="invoice-requisites">
            <div className="invoice-requisites-title">Реквизиты:</div>
            <div className="invoice-requisites-value">{selectedWithdrawal.requisites}</div>
          </div>
        )}

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
            <input
              type="number"
              className="input invoice-total-input"
              value={debtAmount}
              onChange={(e) => setDebtAmount(parseInt(e.target.value, 10) || 0)}
            />
            <span className="invoice-total-currency">₽</span>
          </div>
          <div className="invoice-total-row">
            <span className="invoice-total-label">
              Сумма процента ({selectedWithdrawal?.percent || 0}%
              {selectedWithdrawal?.percent_type === "excluded" ? " — не включён" : ""}):
            </span>
            <input
              type="number"
              className="input invoice-total-input"
              value={percentAmount}
              onChange={(e) => setPercentAmount(parseInt(e.target.value, 10) || 0)}
            />
            <span className="invoice-total-currency">₽</span>
          </div>
          <div className="invoice-total-row">
            <span className="invoice-total-label">
              Сумма налога ({selectedWithdrawal?.tax_percent || 0}%):
            </span>
            <input
              type="number"
              className="input invoice-total-input"
              value={taxAmount}
              onChange={(e) => setTaxAmount(parseInt(e.target.value, 10) || 0)}
            />
            <span className="invoice-total-currency">₽</span>
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
            disabled={!form.withdrawalId || selectedLogs.length === 0}
          >
            Сформировать счёт
          </button>
        </div>
      </div>
    </div>
  );
}
