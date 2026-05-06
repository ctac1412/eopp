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
  const [isAdmin, setIsAdmin] = useState(false);
  const [apiLabel, setApiLabel] = useState(null);
  const [apiRemaining, setApiRemaining] = useState(null);
  const [apiMaxUses, setApiMaxUses] = useState(null);
  const [apiPriceCreate, setApiPriceCreate] = useState(null);
  const [apiPriceReschedule, setApiPriceReschedule] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      setIsAdmin(false);
      return;
    }
    fetch("/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        setIsAdmin(true);
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, []);

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
    <div className="status-bar">
      <div className="status-bar__left">
        <div
          className={
            "status-dot" + (sseError ? " status-dot--error" : isActive ? "" : " status-dot--idle")
          }
        />
        {isActive && (
          <div className="status-text">
            Активная: <strong>{activeId}</strong>
          </div>
        )}
        {localMode && <span className="local-badge">LOCAL</span>}
        {sseError && <span className="status-error">{sseError}</span>}
      </div>
      <div className="status-bar__right">
        {localMode && (
          <div className="test-links">
            <button
              className="test-link-btn"
              onClick={() => openTestPage("/test-injector/edit")}
            >
              Тест: Создание
            </button>
            <button
              className="test-link-btn"
              onClick={() => openTestPage("/test-injector/reschedule")}
            >
              Тест: Перенос
            </button>
          </div>
        )}
        {apiPriceCreate != null && (
          <span className="status-bar__tariff status-bar__tariff--create">{apiPriceCreate}₽</span>
        )}
        {apiPriceReschedule != null && (
          <span className="status-bar__tariff status-bar__tariff--reschedule">{apiPriceReschedule}₽</span>
        )}
        {apiKey && (
          <div className="api-key-badge">
            <span className="api-key-badge__text">
              {apiLabel || maskKey(apiKey)}
            </span>
            {apiRemaining != null ? (
              <span className="api-key-badge__limit">
                {apiMaxUses != null ? `${apiRemaining}/${apiMaxUses}` : `${apiRemaining}`}
              </span>
            ) : (
              <span className="api-key-badge__unlimited">Безлимит</span>
            )}
            {showChange ? (
              <div className="api-key-badge__actions">
                <button
                  className="api-key-badge__confirm"
                  onClick={handleClearKey}
                >
                  ОК
                </button>
                <button
                  className="api-key-badge__cancel"
                  onClick={() => setShowChange(false)}
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button
                className="api-key-badge__btn"
                onClick={() => setShowChange(true)}
              >
                Сменить
              </button>
            )}
          </div>
        )}
        <button
          className="btn btn--primary"
          onClick={handleTestRun}
          disabled={loading}
        >
          {loading ? "Запуск..." : "Тестовый запуск"}
        </button>
        <Link to="/admin" className="btn btn--secondary">
          Admin
        </Link>
      </div>
    </div>
  );
}

export default React.memo(StatusBar);
