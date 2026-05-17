import React, { useState, useEffect } from "react";

const DEFAULT_COMMISSION_RATE = 5;
const DEFAULT_TAX_RATE = 6;

export function InvoiceModal({ show, selectedLogs, onGenerate, onClose }) {
  const [debtAmount, setDebtAmount] = useState(0);
  const [percentRate, setPercentRate] = useState(DEFAULT_COMMISSION_RATE);
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!selectedLogs || selectedLogs.length === 0) {
      setDebtAmount(0);
      return;
    }
    const sum = selectedLogs.reduce((acc, log) => acc + (log.price || 0), 0);
    setDebtAmount(sum);
  }, [selectedLogs]);

  // Сброс при повторном открытии
  useEffect(() => {
    if (show) {
      setPercentRate(DEFAULT_COMMISSION_RATE);
      setTaxRate(DEFAULT_TAX_RATE);
      setComment("");
    }
  }, [show]);

  const combinedRate = percentRate + taxRate;
  const divisor = combinedRate < 100 ? 1 - combinedRate / 100 : 0;
  const totalAmount = divisor > 0 ? Math.round(debtAmount / divisor) : 0;
  const percentAmount = Math.round(totalAmount * percentRate / 100);
  const taxAmount = Math.round(totalAmount * taxRate / 100);

  const handleGenerate = () => {
    onGenerate({
      percentRate,
      taxRate,
      percentAmount,
      taxAmount,
      totalAmount,
      comment,
      logs: selectedLogs,
    });
  };

  if (!show) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Генерация счёта</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <div className="fw-semibold mb-2">Выбранные записи ({selectedLogs.length}):</div>
              <div className="table-responsive">
                <table className="table table-sm table-bordered">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>№</th>
                      <th>Дата</th>
                      <th>Reservation ID</th>
                      <th>Тип</th>
                      <th style={{ width: "80px" }}>Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLogs.map((log, i) => {
                      const config = log.config_json || {};
                      const mode = config.mode || "create";
                      const opType = mode === "reschedule" ? "Перенос" : "Создание";
                      return (
                        <tr key={log.id}>
                          <td>{i + 1}</td>
                          <td>{(log.created_at || "").substring(0, 10)}</td>
                          <td>{(log.reservation_id || "").substring(0, 20)}</td>
                          <td>{opType}</td>
                          <td>{log.price || 0} ₽</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-3">
              <div className="row mb-2">
                <div className="col">
                  <span className="fw-semibold">Сумма долга:</span>
                  <span className="ms-2">{debtAmount} ₽</span>
                </div>
              </div>

              <table className="table table-sm table-bordered mb-2">
                <thead>
                  <tr>
                    <th>Ставка</th>
                    <th>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span>Комиссия:</span>{" "}
                      <input
                        type="number"
                        step="0.01"
                        className="form-control form-control-sm d-inline-block"
                        style={{ width: "80px" }}
                        value={percentRate}
                        onChange={(e) => setPercentRate(parseFloat(e.target.value) || 0)}
                      />
                      <span>%</span>
                    </td>
                    <td>
                      <span>{percentAmount} ₽</span>
                      <span className="text-muted ms-1">от ИТОГО</span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span>Налог:</span>{" "}
                      <input
                        type="number"
                        step="0.01"
                        className="form-control form-control-sm d-inline-block"
                        style={{ width: "80px" }}
                        value={taxRate}
                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      />
                      <span>%</span>
                    </td>
                    <td>
                      <span>{taxAmount} ₽</span>
                      <span className="text-muted ms-1">от ИТОГО</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="fw-bold mb-2">
                <span>ИТОГО:</span>
                <span className="ms-2">{totalAmount} ₽</span>
              </div>

              <div className="mb-0">
                <label className="form-label">Комментарий</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Необязательно"
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleGenerate}
              disabled={selectedLogs.length === 0 || totalAmount <= 0}
            >
              Сформировать счёт
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
