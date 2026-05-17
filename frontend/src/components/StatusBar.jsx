import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useCaptchaStore from "../store/useCaptchaStore";

function maskKey(key) {
  if (!key || key.length === 0) return "••••••";
  if (key.length <= 8) {
    if (key.length === 1) return key[0];
    return key[0] + "•".repeat(key.length - 2) + key[key.length - 1];
  }
  return key.slice(0, 4) + "••••••" + key.slice(-4);
}

const LOCALHOST_ORIGINS = ["localhost", "127.0.0.1"];

function isLocalhost() {
  return LOCALHOST_ORIGINS.includes(window.location.hostname);
}

function StatusBar() {
  const queue = useCaptchaStore((s) => s.queue);
  const unsolved = queue.filter((q) => !q.solved);
  const isActive = unsolved.length > 0;
  const activeId = isActive ? unsolved[0].id : null;
  const sseError = useCaptchaStore((s) => s.sseError);
  const [loading, setLoading] = useState(false);
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const clearApiKey = useCaptchaStore((s) => s.clearApiKey);
  const [showChange, setShowChange] = useState(false);
  const [apiLabel, setApiLabel] = useState(null);
  const [apiRemaining, setApiRemaining] = useState(null);
  const [apiMaxUses, setApiMaxUses] = useState(null);
  const [apiPriceCreate, setApiPriceCreate] = useState(null);
  const [apiPriceReschedule, setApiPriceReschedule] = useState(null);

  useEffect(() => {
    if (!apiKey) {
      setApiLabel(null);
      setApiRemaining(null);
      setApiMaxUses(null);
      setApiPriceCreate(null);
      setApiPriceReschedule(null);
      return;
    }
    fetch(`/validate-key?api_key=${encodeURIComponent(apiKey)}`)
      .then((r) => r.json())
      .then((data) => {
        setApiLabel(data.label || null);
        setApiRemaining(data.remaining ?? null);
        setApiMaxUses(data.max_uses ?? null);
        setApiPriceCreate(data.price_create ?? null);
        setApiPriceReschedule(data.price_reschedule ?? null);
      })
      .catch(() => {
        setApiLabel(null);
        setApiRemaining(null);
        setApiMaxUses(null);
        setApiPriceCreate(null);
        setApiPriceReschedule(null);
      });
  }, [apiKey]);

  const handleTestRun = async () => {
    setLoading(true);
    try {
      await fetch("/trigger-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          reservation_id: "00000000-0000-0000-0000-000000000000",
        }),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearKey = () => {
    clearApiKey();
    setShowChange(false);
  };

  const localMode = isLocalhost();

  const openTestPage = (path) => {
    const url = `${window.location.origin}${path}`;
    window.open(url, "_blank");
  };

  return (
    <div className="status-bar d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div className="d-flex align-items-center gap-2">
        <span className={`status-dot ${sseError ? "status-dot--error" : isActive ? "status-dot--active" : "status-dot--idle"}`} />
        {isActive && (
          <span style={{ fontSize: "0.8125rem" }}>
            <span style={{ color: "#6e7681" }}>Активная:</span>{" "}
            <strong style={{ fontFamily: "var(--bs-font-monospace)", fontSize: "0.75rem", color: "var(--accent-light)" }}>{activeId}</strong>
          </span>
        )}
        {!isActive && !sseError && (
          <span style={{ fontSize: "0.8125rem", color: "#484f58" }}>Ожидание...</span>
        )}
        {sseError && <span style={{ fontSize: "0.75rem", color: "var(--bs-danger)" }}>{sseError}</span>}
        {localMode && <span className="local-tag">LOCAL</span>}
      </div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {apiPriceCreate != null && (
          <span className="tariff-badge tariff-badge--create">{apiPriceCreate}₽</span>
        )}
        {apiPriceReschedule != null && (
          <span className="tariff-badge tariff-badge--reschedule">{apiPriceReschedule}₽</span>
        )}
        {apiKey && (
          <div className="d-flex align-items-center gap-2" style={{ fontSize: "0.8125rem" }}>
            <span className="api-key">{apiLabel || maskKey(apiKey)}</span>
            {apiRemaining != null ? (
              <span className="api-key-limit">
                {apiMaxUses != null ? `${apiRemaining}/${apiMaxUses}` : `${apiRemaining}`}
              </span>
            ) : (
              <span className="api-key-limit api-key-limit--unlimited">Безлимит</span>
            )}
            {showChange ? (
              <div className="btn-group btn-group-sm">
                <button className="btn btn-sm btn-success" onClick={handleClearKey}>ОК</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowChange(false)}>Отмена</button>
              </div>
            ) : (
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowChange(true)}>Сменить</button>
            )}
          </div>
        )}
        {localMode && (
          <div className="btn-group btn-group-sm">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => openTestPage("/test-injector/edit")}>Создание</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => openTestPage("/test-injector/reschedule")}>Перенос</button>
          </div>
        )}
        <button
          className="btn btn-sm btn-primary"
          onClick={handleTestRun}
          disabled={loading}
        >
          {loading ? "Запуск..." : "Тест"}
        </button>
        <Link to="/admin" className="btn btn-sm btn-outline-secondary">
          Админ
        </Link>
      </div>
    </div>
  );
}

export default React.memo(StatusBar);
