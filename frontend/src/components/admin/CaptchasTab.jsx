import React, { useState, useEffect, useCallback } from "react";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

function adminHeadersJson(token) {
  return { "X-Admin-Token": token };
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CaptchasTab({ adminToken, keys, onError }) {
  const [captchas, setCaptchas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [filterFailed, setFilterFailed] = useState(false);
  const [filterMine, setFilterMine] = useState(false);
  const [myKeyId, setMyKeyId] = useState("");
  const [sending, setSending] = useState(false);

  const fetchCaptchas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterFailed) params.set("status", "failed");
      if (filterMine && myKeyId) params.set("api_key_id", myKeyId);
      const res = await fetch(`/admin/captchas?${params}`, {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCaptchas(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (err) {
      onError?.(err.message);
      setCaptchas([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, filterFailed, filterMine, myKeyId, onError]);

  useEffect(() => {
    fetchCaptchas();
  }, [fetchCaptchas]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === captchas.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(captchas.map((c) => c.id)));
    }
  };

  const handleSendSelected = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await fetch("/admin/captchas/send-selected", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          captcha_ids: captchas
            .filter((c) => selected.has(c.id))
            .map((c) => c.captcha_id),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onError?.(null);
      alert(`Отправлено ${data.sent} капч`);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSending(false);
    }
  };

  const solvedBadge = (correctAnswer, status) => {
    const isPassed = status === "passed" || status === "confirmed";
    const cls = isPassed ? "bg-success" : "bg-danger";
    const label = isPassed ? "Решена" : "Не пройдена";
    return <span className={`badge ${cls}`}>{label}</span>;
  };

  if (loading) {
    return <div className="text-center text-muted py-3">Загрузка…</div>;
  }

  return (
    <div>
      <div className="d-flex gap-2 mb-3 align-items-center flex-wrap">
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="filterFailed"
            checked={filterFailed}
            onChange={(e) => setFilterFailed(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="filterFailed">
            Не прошедшие
          </label>
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="filterMine"
            checked={filterMine}
            onChange={(e) => setFilterMine(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="filterMine">
            Пользователь
          </label>
        </div>
        {filterMine && (
          <select
            className="form-select form-select-sm"
            style={{ width: "auto" }}
            value={myKeyId}
            onChange={(e) => setMyKeyId(e.target.value)}
          >
            <option value="">Выберите пользователя</option>
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label || k.key}
              </option>
            ))}
          </select>
        )}
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={fetchCaptchas}
        >
          Обновить
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleSendSelected}
          disabled={selected.size === 0 || sending}
        >
          {sending
            ? "Отправка…"
            : `Отправить выбранные (${selected.size})`}
        </button>
      </div>

      {captchas.length === 0 ? (
        <div className="text-center text-muted py-3">Нет капч</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-hover table-bordered align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: "40px" }}>
                  <input
                    type="checkbox"
                    checked={
                      captchas.length > 0 &&
                      selected.size === captchas.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th style={{ width: "50px" }}>ID</th>
                <th>Captcha ID</th>
                <th style={{ width: "100px" }}>Решена</th>
                <th style={{ width: "120px" }}>Причина отказа</th>
                <th style={{ width: "100px" }}>Tiles Hash</th>
                <th style={{ width: "120px" }}>Пользователь</th>
                <th style={{ width: "100px" }}>Usage Log</th>
                <th style={{ width: "160px" }}>Дата</th>
              </tr>
            </thead>
            <tbody>
              {captchas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td>{c.id}</td>
                  <td className="font-monospace small">{c.captcha_id}</td>
                  <td>{solvedBadge(c.correct_answer, c.status)}</td>
                  <td className="small text-danger">{c.fail_reason || "—"}</td>
                  <td className="font-monospace small">{c.tiles_hash || "—"}</td>
                  <td className="small">{c.key_label || "—"}</td>
                  <td>{c.usage_log_id}</td>
                  <td className="small">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
