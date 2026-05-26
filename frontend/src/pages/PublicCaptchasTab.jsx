import React, { useCallback, useEffect, useMemo, useState } from "react";

const statusLabel = {
  passed: "Пройдена",
  failed: "Ошибка",
};

export function PublicCaptchasTab({ onReplaySent }) {
  const [captchas, setCaptchas] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const fetchCaptchas = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/public/captchas");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCaptchas(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
      setCaptchas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaptchas();
  }, [fetchCaptchas]);

  const selectedCaptchas = useMemo(
    () => Array.from(selected),
    [selected],
  );

  const toggleSelect = (captchaId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(captchaId)) next.delete(captchaId);
      else next.add(captchaId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const visibleIds = captchas.map((captcha) => captcha.captcha_id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(visibleIds);
    });
  };

  const sendSelected = async () => {
    if (selectedCaptchas.length === 0) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/public/captchas/send-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captcha_ids: selectedCaptchas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSelected(new Set());
      onReplaySent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const allSelected =
    captchas.length > 0 && captchas.every((captcha) => selected.has(captcha.captcha_id));

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={fetchCaptchas} disabled={loading}>
            Обновить
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={sendSelected}
            disabled={sending || selectedCaptchas.length === 0}
          >
            Повторить выбранные
          </button>
        </div>
        <span className="text-muted small">Выбрано: {selectedCaptchas.length}</span>
      </div>

      {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th className="text-center" style={{ width: 48 }}>
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={captchas.length === 0}
                />
              </th>
              <th>ID капчи</th>
              <th className="text-center" style={{ width: 140 }}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="text-center text-muted py-4">Загрузка...</td>
              </tr>
            ) : captchas.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-muted py-4">Нет капч</td>
              </tr>
            ) : (
              captchas.map((captcha, index) => (
                <tr key={`${captcha.captcha_id}-${index}`}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={selected.has(captcha.captcha_id)}
                      onChange={() => toggleSelect(captcha.captcha_id)}
                    />
                  </td>
                  <td className="font-monospace small">{captcha.captcha_id}</td>
                  <td className="text-center">
                    <span className={`badge ${captcha.status === "passed" ? "bg-success" : "bg-danger"}`}>
                      {statusLabel[captcha.status] || captcha.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
