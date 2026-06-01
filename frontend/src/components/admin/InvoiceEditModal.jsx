import React, { useState, useEffect } from "react";
import { formatMoney } from "../../utils/format";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

export function InvoiceEditModal({ show, invoice, onClose, onSave, adminToken, users }) {
  const [form, setForm] = useState({
    comment: "", percent_rate: 0, tax_rate: 0, debt_amount: 0,
    percent_amount: 0, tax_amount: 0, total_amount: 0,
    commission_user_id: null, tax_user_id: null,
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usageLogs, setUsageLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [screenMode, setScreenMode] = useState(false);
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    if (show && invoice) {
      setForm({
        comment: invoice.comment || "", percent_rate: invoice.percent_rate || 0,
        tax_rate: invoice.tax_rate || 0, debt_amount: invoice.debt_amount || 0,
        percent_amount: invoice.percent_amount || 0, tax_amount: invoice.tax_amount || 0,
        total_amount: invoice.total_amount || 0,
        commission_user_id: invoice.commission_user_id || null,
        tax_user_id: invoice.tax_user_id || null,
      });
      setItems(invoice.items || []);
      setLogsLoading(true);
      fetch(`/usage-log?invoice_id=${invoice.id}`, { headers: { "X-Admin-Token": adminToken } })
        .then((r) => r.json()).then((d) => setUsageLogs(Array.isArray(d) ? d : []))
        .catch(() => setUsageLogs([])).finally(() => setLogsLoading(false));
    }
  }, [show, invoice]);

  const itemsTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const addItem = () => setItems((p) => [...p, { description: "", amount: 0, sort_order: p.length }]);
  const removeItem = (i) => setItems((p) => p.filter((_, j) => j !== i));
  const updateItem = (i, f, v) => setItems((p) => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n; });

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/admin/invoices/${invoice.id}`, {
        method: "PATCH", headers: adminHeaders(adminToken),
        body: JSON.stringify({
          comment: form.comment, percent_rate: form.percent_rate, tax_rate: form.tax_rate,
          debt_amount: form.debt_amount, percent_amount: form.percent_amount,
          tax_amount: form.tax_amount, total_amount: form.total_amount,
          commission_user_id: form.commission_user_id, tax_user_id: form.tax_user_id,
          items: items.map((it, i) => ({ description: it.description, amount: Number(it.amount) || 0, sort_order: i })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSave?.(await res.json()); onClose();
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  if (!show || !invoice) return null;

  const printTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const printPercent = Math.round(printTotal * (invoice.percent_rate || 0) / 100);
  const printTax = Math.round(printTotal * (invoice.tax_rate || 0) / 100);
  const printDebt = invoice.debt_amount || 0;
  const printFinal = invoice.total_amount || (printTotal + printPercent + printTax);

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Редактировать счёт #{invoice.id}</h5>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-light" onClick={() => setPrintMode(true)}>🖨</button>
                <button className={`btn btn-sm ${screenMode ? "btn-warning" : "btn-outline-light"}`}
                  onClick={() => setScreenMode(!screenMode)}>{screenMode ? "✕" : "📷"}</button>
                <button className="btn-close" onClick={onClose}></button>
              </div>
            </div>
            <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {!screenMode && (<>
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label fw-bold mb-0">Строки счёта</label>
                    <button className="btn btn-sm btn-outline-primary" onClick={addItem}>+ Добавить</button>
                  </div>
                  {items.length === 0 && <div className="text-muted small mb-2">Нет строк</div>}
                  {items.map((it, idx) => (
                    <div key={idx} className="row g-2 mb-2 align-items-center">
                      <div className="col-8"><input type="text" className="form-control form-control-sm" placeholder="Описание"
                        value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} /></div>
                      <div className="col-3"><div className="input-group input-group-sm">
                        <input type="number" className="form-control" value={it.amount}
                          onChange={(e) => updateItem(idx, "amount", e.target.value)} /><span className="input-group-text">₽</span></div></div>
                      <div className="col-1 text-center"><button className="btn btn-sm btn-outline-danger" onClick={() => removeItem(idx)}>×</button></div>
                    </div>
                  ))}
                  {items.length > 0 && <div className="small text-muted">Сумма строк: {formatMoney(itemsTotal)}</div>}
                </div>
                <hr />
                <div className="mb-3">
                  <label className="form-label fw-bold">Записи в счёте</label>
                  {logsLoading && <div className="text-muted small">Загрузка...</div>}
                  {!logsLoading && usageLogs.length === 0 && <div className="text-muted small">Нет привязанных записей</div>}
                  {usageLogs.length > 0 && (<div style={{ maxHeight: "150px", overflowY: "auto" }}>
                    <table className="table table-sm table-borderless small mb-0"><thead><tr className="text-muted"><th>ID</th><th>Дата</th><th>Ключ</th><th>Сумма</th></tr></thead>
                      <tbody>{usageLogs.map((l) => (<tr key={l.id}><td>{l.id}</td>
                        <td>{l.created_at ? new Date(l.created_at).toLocaleDateString("ru-RU") : "—"}</td>
                        <td>{l.label || l.api_key_id || "—"}</td><td>{formatMoney(l.price)}</td></tr>))}</tbody></table></div>)}
                </div>
                <hr />
                <div className="mb-3"><label className="form-label fw-bold">Суммы</label>
                  <div className="row g-2">
                    <div className="col-6"><label className="form-label small text-muted">Сумма долга (debt)</label>
                      <input type="number" className="form-control form-control-sm" value={form.debt_amount}
                        onChange={(e) => setForm((p) => ({ ...p, debt_amount: Number(e.target.value) || 0 }))} /></div>
                    <div className="col-6"><label className="form-label small text-muted">Итого (total)</label>
                      <input type="number" className="form-control form-control-sm" value={form.total_amount}
                        onChange={(e) => setForm((p) => ({ ...p, total_amount: Number(e.target.value) || 0 }))} /></div>
                  </div></div>
                <div className="mb-3"><label className="form-label fw-bold">Ставки</label>
                  <div className="row g-2">
                    <div className="col-6"><label className="form-label small text-muted">Комиссия (%)</label>
                      <input type="number" step="0.01" className="form-control form-control-sm" value={form.percent_rate}
                        onChange={(e) => setForm((p) => ({ ...p, percent_rate: Number(e.target.value) || 0 }))} /></div>
                    <div className="col-6"><label className="form-label small text-muted">Налог (%)</label>
                      <input type="number" step="0.01" className="form-control form-control-sm" value={form.tax_rate}
                        onChange={(e) => setForm((p) => ({ ...p, tax_rate: Number(e.target.value) || 0 }))} /></div>
                  </div></div>
                <div className="mb-3"><label className="form-label fw-bold">Распределение</label>
                  <div className="row g-2">
                    <div className="col-6"><label className="form-label small text-muted">Кто получает комиссию</label>
                      <select className="form-select form-select-sm" value={form.commission_user_id ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, commission_user_id: e.target.value ? Number(e.target.value) : null }))}>
                        <option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                    <div className="col-6"><label className="form-label small text-muted">Кто платит налог</label>
                      <select className="form-select form-select-sm" value={form.tax_user_id ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, tax_user_id: e.target.value ? Number(e.target.value) : null }))}>
                        <option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                  </div></div>
                <div className="mb-3"><label className="form-label">Комментарий</label>
                  <textarea className="form-control" rows={2} value={form.comment}
                    onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} /></div>
              </>)}
              {screenMode && (
                <div style={{ background: "#0d1117", color: "#c9d1d9", borderRadius: "8px", padding: "16px", fontFamily: "monospace", fontSize: "13px", lineHeight: "1.6" }}>
                  <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "12px", borderBottom: "1px solid #30363d", paddingBottom: "8px" }}>
                    Счёт #{invoice.id} {invoice.invoice_number ? `(${invoice.invoice_number})` : ""}</div>
                  {items.map((it, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{it.description || `Строка ${i + 1}`}</span><span>{formatMoney(it.amount)}</span></div>))}
                  <div style={{ borderTop: "1px solid #30363d", paddingTop: "8px", marginTop: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Строки</span><span>{formatMoney(itemsTotal)}</span></div>
                    {(form.percent_rate || invoice.percent_rate) > 0 && (<div style={{ display: "flex", justifyContent: "space-between", color: "#8b949e" }}>
                      <span>Комиссия ({form.percent_rate || invoice.percent_rate}%)</span>
                      <span>{formatMoney(Math.round(itemsTotal * (form.percent_rate || invoice.percent_rate || 0) / 100))}</span></div>)}
                    {(form.tax_rate || invoice.tax_rate) > 0 && (<div style={{ display: "flex", justifyContent: "space-between", color: "#8b949e" }}>
                      <span>Налог ({form.tax_rate || invoice.tax_rate}%)</span>
                      <span>{formatMoney(Math.round(itemsTotal * (form.tax_rate || invoice.tax_rate || 0) / 100))}</span></div>)}
                    {form.debt_amount > 0 && (<div style={{ display: "flex", justifyContent: "space-between", color: "#8b949e" }}>
                      <span>Долг</span><span>{formatMoney(form.debt_amount)}</span></div>)}
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginTop: "4px", borderTop: "1px solid #30363d", paddingTop: "4px" }}>
                      <span>К оплате</span><span>{formatMoney(form.total_amount || itemsTotal)}</span></div>
                  </div>
                  {usageLogs.length > 0 && (<div style={{ marginTop: "12px", borderTop: "1px solid #30363d", paddingTop: "8px", color: "#8b949e", fontSize: "12px" }}>
                    <div style={{ fontWeight: "bold", color: "#c9d1d9", marginBottom: "4px" }}>Записи:</div>
                    {usageLogs.map((l) => (<div key={l.id} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>#{l.id} {l.created_at ? new Date(l.created_at).toLocaleDateString("ru-RU") : ""} {l.label || ""}</span>
                      <span>{formatMoney(l.price)}</span></div>))}</div>)}
                  {form.comment && (<div style={{ marginTop: "12px", borderTop: "1px solid #30363d", paddingTop: "8px", color: "#8b949e", fontSize: "12px", fontStyle: "italic" }}>{form.comment}</div>)}
                </div>
              )}
            </div>
            {!screenMode && (<div className="modal-footer">
              <button className="btn btn-sm btn-secondary" onClick={onClose}>Отмена</button>
              <button className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? "Сохранение..." : "Сохранить"}</button></div>)}
          </div></div></div>
      {printMode && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: "#fff", color: "#000", fontFamily: "Arial, sans-serif", overflow: "auto", padding: "20px 32px" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "2px solid #000", paddingBottom: "8px" }}>
              <div><div style={{ fontSize: "20px", fontWeight: "bold" }}>Счёт #{invoice.id}</div>
                {invoice.invoice_number && <div style={{ fontSize: "13px", color: "#555" }}>№ {invoice.invoice_number}</div>}</div>
              <button onClick={() => { setPrintMode(false); setTimeout(() => window.print(), 100); }} style={{ padding: "6px 16px", fontSize: "13px", cursor: "pointer" }}>Печатать</button></div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
              <thead><tr style={{ borderBottom: "1px solid #ccc", textAlign: "left", fontSize: "12px", color: "#555" }}>
                <th style={{ padding: "4px 8px" }}>#</th><th style={{ padding: "4px 8px" }}>Описание</th><th style={{ padding: "4px 8px", textAlign: "right" }}>Сумма</th></tr></thead>
              <tbody>{items.map((it, i) => (<tr key={i} style={{ borderBottom: "1px solid #eee", fontSize: "13px" }}>
                <td style={{ padding: "4px 8px", color: "#888" }}>{i + 1}</td>
                <td style={{ padding: "4px 8px" }}>{it.description || `Строка ${i + 1}`}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{formatMoney(it.amount)}</td></tr>))}</tbody></table>
            <div style={{ textAlign: "right", fontSize: "13px", marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "100px", borderTop: "1px solid #ccc", paddingTop: "6px" }}><span>Строки:</span><span>{formatMoney(printTotal)}</span></div>
              {(invoice.percent_rate || 0) > 0 && (<div style={{ display: "flex", justifyContent: "flex-end", gap: "100px", color: "#555" }}>
                <span>Комиссия ({invoice.percent_rate}%):</span><span>{formatMoney(printPercent)}</span></div>)}
              {(invoice.tax_rate || 0) > 0 && (<div style={{ display: "flex", justifyContent: "flex-end", gap: "100px", color: "#555" }}>
                <span>Налог ({invoice.tax_rate}%):</span><span>{formatMoney(printTax)}</span></div>)}
              {printDebt > 0 && (<div style={{ display: "flex", justifyContent: "flex-end", gap: "100px", color: "#555" }}>
                <span>Долг:</span><span>{formatMoney(printDebt)}</span></div>)}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "100px", borderTop: "1px solid #000", paddingTop: "6px", fontWeight: "bold", fontSize: "15px" }}>
                <span>Итого к оплате:</span><span>{formatMoney(printFinal)}</span></div></div>
            {usageLogs.length > 0 && (<div style={{ fontSize: "12px", marginBottom: "8px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Записи:</div>
              {usageLogs.map((l) => (<div key={l.id} style={{ display: "flex", justifyContent: "space-between", maxWidth: "500px", color: "#555" }}>
                <span>#{l.id} — {l.created_at ? new Date(l.created_at).toLocaleDateString("ru-RU") : "—"} — {l.label || "—"}</span>
                <span>{formatMoney(l.price)}</span></div>))}</div>)}
            {invoice.comment && (<div style={{ padding: "8px", background: "#f5f5f5", borderRadius: "4px", fontSize: "12px", color: "#555", fontStyle: "italic" }}>{invoice.comment}</div>)}
          </div></div>)}
    </>
  );
}
