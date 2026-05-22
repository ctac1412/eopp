import React, { useState, useEffect, useCallback, useMemo } from "react";

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
  const [preset, setPreset] = useState("all");
  const [search, setSearch] = useState("");
  const [keyFilter, setKeyFilter] = useState("all");
  const [answerFilter, setAnswerFilter] = useState("all");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchCaptchas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/admin/captchas", {
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
  }, [adminToken, onError]);

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
    setSelected((prev) => {
      const allVisibleSelected = filteredCaptchas.every((captcha) => prev.has(captcha.id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        filteredCaptchas.forEach((captcha) => next.delete(captcha.id));
        return next;
      }
      return new Set([...prev, ...filteredCaptchas.map((captcha) => captcha.id)]);
    });
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

  const hashCounts = useMemo(() => {
    const counts = {};
    captchas.forEach((captcha) => {
      if (!captcha.tiles_hash) return;
      counts[captcha.tiles_hash] = (counts[captcha.tiles_hash] || 0) + 1;
    });
    return counts;
  }, [captchas]);

  const keyOptions = useMemo(() => {
    const optionMap = new Map();
    keys.forEach((key) => optionMap.set(String(key.id), key.label || key.key || `#${key.id}`));
    captchas.forEach((captcha) => {
      if (captcha.api_key_id == null) return;
      if (!optionMap.has(String(captcha.api_key_id))) {
        optionMap.set(String(captcha.api_key_id), captcha.key_label || `#${captcha.api_key_id}`);
      }
    });
    return [...optionMap.entries()].map(([id, label]) => ({ id, label }));
  }, [captchas, keys]);

  const filteredCaptchas = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return captchas.filter((captcha) => {
      if (preset === "passed" && captcha.status !== "passed") return false;
      if (preset === "failed" && captcha.status !== "failed") return false;
      if (keyFilter !== "all" && String(captcha.api_key_id) !== keyFilter) return false;
      if (answerFilter === "known" && !captcha.correct_answer) return false;
      if (answerFilter === "missing" && captcha.correct_answer) return false;
      if (duplicatesOnly && !(captcha.tiles_hash && hashCounts[captcha.tiles_hash] > 1)) return false;
      if (!normalizedSearch) return true;
      return [
        captcha.id,
        captcha.captcha_id,
        captcha.tiles_hash,
        captcha.fail_reason,
        captcha.key_label,
        captcha.usage_log_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [answerFilter, captchas, duplicatesOnly, hashCounts, keyFilter, preset, search]);

  const metrics = useMemo(() => ({
    total: filteredCaptchas.length,
    passed: filteredCaptchas.filter((captcha) => captcha.status === "passed").length,
    failed: filteredCaptchas.filter((captcha) => captcha.status === "failed").length,
    answerKnown: filteredCaptchas.filter((captcha) => !!captcha.correct_answer).length,
    duplicatePuzzles: filteredCaptchas.filter((captcha) => captcha.tiles_hash && hashCounts[captcha.tiles_hash] > 1).length,
  }), [filteredCaptchas, hashCounts]);

  const failureSummary = useMemo(() => {
    const groups = {};
    filteredCaptchas
      .filter((captcha) => captcha.status === "failed")
      .forEach((captcha) => {
        const reason = captcha.fail_reason || "Без причины";
        if (!groups[reason]) groups[reason] = { reason, count: 0 };
        groups[reason].count++;
      });
    return Object.values(groups).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [filteredCaptchas]);

  const userSummary = useMemo(() => {
    const groups = {};
    filteredCaptchas.forEach((captcha) => {
      const label = captcha.key_label || "Без пользователя";
      if (!groups[label]) groups[label] = { label, total: 0, failed: 0 };
      groups[label].total++;
      if (captcha.status === "failed") groups[label].failed++;
    });
    return Object.values(groups).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [filteredCaptchas]);

  if (loading) {
    return <div className="text-center text-muted py-3">Загрузка…</div>;
  }

  return (
    <div>
      <div className="d-flex gap-2 mb-2 align-items-center flex-wrap">
        <div className="btn-group btn-group-sm" role="group" aria-label="Фильтр капч">
          {[
            { id: "all", label: "Все" },
            { id: "passed", label: "Решенные" },
            { id: "failed", label: "Не прошедшие" },
          ].map((item) => (
            <button
              key={item.id}
              className={`btn ${preset === item.id ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
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
        <span className="text-muted small ms-auto">
          Показано: {filteredCaptchas.length} из {captchas.length}
        </span>
      </div>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-12 col-xl-4">
          <label className="form-label small mb-1">Поиск</label>
          <input
            className="form-control form-control-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Captcha ID, hash, причина, usage log, пользователь"
          />
        </div>
        <div className="col-6 col-md-4 col-xl-3">
          <label className="form-label small mb-1">Пользователь</label>
          <select className="form-select form-select-sm" value={keyFilter} onChange={(event) => setKeyFilter(event.target.value)}>
            <option value="all">Все</option>
            {keyOptions.map((key) => <option key={key.id} value={key.id}>{key.label}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <label className="form-label small mb-1">Ответ</label>
          <select className="form-select form-select-sm" value={answerFilter} onChange={(event) => setAnswerFilter(event.target.value)}>
            <option value="all">Все</option>
            <option value="known">Есть ответ</option>
            <option value="missing">Без ответа</option>
          </select>
        </div>
        <div className="col-12 col-md-4 col-xl-3">
          <div className="form-check mb-1">
            <input
              className="form-check-input"
              type="checkbox"
              id="duplicateCaptchas"
              checked={duplicatesOnly}
              onChange={(event) => setDuplicatesOnly(event.target.checked)}
            />
            <label className="form-check-label" htmlFor="duplicateCaptchas">
              Только повторные пазлы
            </label>
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <span className="badge text-bg-secondary">Всего: {metrics.total}</span>
        <span className="badge text-bg-success">Решено: {metrics.passed}</span>
        <span className="badge text-bg-danger">Не прошли: {metrics.failed}</span>
        <span className="badge text-bg-primary">С ответом: {metrics.answerKnown}</span>
        <span className="badge text-bg-warning">Повторы: {metrics.duplicatePuzzles}</span>
      </div>

      {(failureSummary.length > 0 || userSummary.length > 0) && (
        <div className="row g-3 mb-3">
          {failureSummary.length > 0 && (
            <div className="col-12 col-xl-7">
              <div className="card h-100">
                <div className="card-header fw-semibold">Причины непройденных капч</div>
                <div className="card-body p-0">
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Причина</th>
                        <th className="text-center" style={{ width: "72px" }}>Кол-во</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failureSummary.map((row) => (
                        <tr key={row.reason}>
                          <td className="small" title={row.reason}>{row.reason}</td>
                          <td className="text-center fw-semibold">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {userSummary.length > 0 && (
            <div className="col-12 col-xl-5">
              <div className="card h-100">
                <div className="card-header fw-semibold">Капчи по пользователям</div>
                <div className="card-body p-0">
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Пользователь</th>
                        <th className="text-center">Всего</th>
                        <th className="text-center">Ошибки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userSummary.map((row) => (
                        <tr key={row.label}>
                          <td className="small">{row.label}</td>
                          <td className="text-center">{row.total}</td>
                          <td className="text-center">{row.failed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {filteredCaptchas.length === 0 ? (
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
                      filteredCaptchas.length > 0 &&
                      filteredCaptchas.every((captcha) => selected.has(captcha.id))
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
              {filteredCaptchas.map((c) => (
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
