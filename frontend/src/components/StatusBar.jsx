import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatMoney } from "../utils/format";
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

function loadPersisted(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function savePersisted(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch { /* noop */ }
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
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);
  const setSuperKioskMode = useCaptchaStore((s) => s.setSuperKioskMode);
  const [showChange, setShowChange] = useState(false);
  const [testCaptchaId, setTestCaptchaId] = useState(() => loadPersisted("test_captcha_id", ""));
  const [testCourseId, setTestCourseId] = useState(() => loadPersisted("test_course_id", ""));
  const [courses, setCourses] = useState([]);
  const [testNoTimeout, setTestNoTimeout] = useState(() => loadPersisted("test_no_timeout", "0") === "1");
  const [sequentialIcons, setSequentialIcons] = useState(() => loadPersisted("click_sequential_icons", "0") === "1");
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);
  const connectedOperators = useCaptchaStore((s) => s.connectedOperators);
  const sseConnected = useCaptchaStore((s) => s.sseConnected);
  const operatorCount = Array.isArray(connectedOperators) ? connectedOperators.length : 0;
  const [apiLabel, setApiLabel] = useState(null);
  const [apiRemaining, setApiRemaining] = useState(null);
  const [apiMaxUses, setApiMaxUses] = useState(null);
  const [apiPriceCreate, setApiPriceCreate] = useState(null);
  const [apiPriceReschedule, setApiPriceReschedule] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      setApiLabel(null);
      setApiRemaining(null);
      setApiMaxUses(null);
      setApiPriceCreate(null);
      setApiPriceReschedule(null);
      setIsAdmin(false);
      return;
    }
    const adminToken = localStorage.getItem("admin_token");
    const hasAdmin = adminToken && apiKey === adminToken;
    setIsAdmin(hasAdmin);
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

  useEffect(() => {
    function handleClickOutside(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    }
    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

  useEffect(() => {
    if (showSettings && courses.length === 0) {
      fetch("/training/courses")
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(setCourses)
        .catch((err) => console.warn("Failed to load courses:", err));
    }
  }, [showSettings, courses.length]);

  const handleCaptchaIdChange = (val) => {
    setTestCaptchaId(val);
    savePersisted("test_captcha_id", val);
  };

  const handleNoTimeoutChange = (val) => {
    setTestNoTimeout(val);
    savePersisted("test_no_timeout", val ? "1" : "0");
  };

  const handleSequentialIconsChange = (val) => {
    setSequentialIcons(val);
    savePersisted("click_sequential_icons", val ? "1" : "0");
  };

  const handleTestRun = async (count = 1) => {
    setLoading(true);
    setShowSettings(false);
    try {
      const body = { api_key: apiKey };
      if (testCaptchaId) body.captcha_id = testCaptchaId;
      if (testCourseId) body.course_id = testCourseId;
      if (testNoTimeout) body.test_no_timeout = true;
      if (count > 1) body.count = count;
      await fetch("/trigger-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const truncatedId = testCaptchaId.length > 16
    ? testCaptchaId.slice(0, 16) + "…"
    : testCaptchaId;

  return (
    <div className="status-bar d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div className="d-flex align-items-center gap-2">
        <span className={`status-dot ${sseError ? "status-dot--error" : isActive || sseConnected ? "status-dot--active" : "status-dot--idle"}`} />
        {isActive && (
          <span style={{ fontSize: "0.8125rem" }}>
            <span style={{ color: "#6e7681" }}>Активная:</span>{" "}
            <strong style={{ fontFamily: "var(--bs-font-monospace)", fontSize: "0.75rem", color: "var(--accent-light)" }}>{activeId}</strong>
          </span>
        )}
        {!isActive && !sseError && (
          <span style={{ fontSize: "0.8125rem", color: sseConnected ? "#3fb950" : "#484f58" }}>
            {sseConnected ? "Подключено" : "Ожидание..."}
          </span>
        )}
        {sseError && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--bs-danger)" }}>{sseError}</span>
            {sseError.includes("Другое подключение") && (
              <button
                className="btn btn-sm btn-warning"
                style={{ fontSize: "0.7rem", padding: "2px 8px" }}
                onClick={() => {
                  const store = useCaptchaStore.getState();
                  store.setPendingForceReconnect(true);
                  store.triggerReconnect();
                }}
              >
                Перехватить
              </button>
            )}
          </>
        )}
        {operatorCount > 0 && (
          <span style={{
            fontSize: "0.75rem", background: "#1a3320", color: "#3fb950",
            padding: "2px 8px", borderRadius: 10, border: "1px solid #238636",
          }}>
            👥 {operatorCount}
          </span>
        )}
        {localMode && <span className="local-tag">LOCAL</span>}
        {superKioskMode && isAdmin && <span className="super-kiosk-tag">СУПЕР</span>}
      </div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {apiPriceCreate != null && (
          <span className="tariff-badge tariff-badge--create">{formatMoney(apiPriceCreate)}</span>
        )}
        {apiPriceReschedule != null && (
          <span className="tariff-badge tariff-badge--reschedule">{formatMoney(apiPriceReschedule)}</span>
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
        <div className="d-flex align-items-center gap-0" ref={settingsRef} style={{ position: "relative" }}>
          {testCaptchaId && (
            <span
              className="api-key-limit"
              style={{ borderRight: "none", borderRadius: "0.25rem 0 0 0.25rem", cursor: "default" }}
              title={testCaptchaId}
            >
              {truncatedId}
            </span>
          )}
          <button
            className={`btn btn-sm ${showSettings ? "btn-outline-primary" : "btn-outline-secondary"}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Настройки тестового запуска"
            style={{ borderRadius: testCaptchaId ? "0 0.5rem 0.5rem 0" : "0.5rem", fontSize: "0.75rem" }}
          >
            ⚙
          </button>
          {showSettings && (
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 6, minWidth: 260,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "0.5rem", padding: "0.625rem", zIndex: 1050,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}>
              <div style={{ fontSize: "0.6875rem", color: "#8b949e", fontWeight: 600, marginBottom: 8 }}>
                ⚙ Настройки тестового запуска
              </div>
              <input
                type="text"
                className="form-control form-control-sm"
                style={{ fontSize: "0.75rem", fontFamily: "var(--bs-font-monospace)", marginBottom: 6 }}
                placeholder="ID капчи (пусто = случайная)"
                value={testCaptchaId}
                onChange={(e) => handleCaptchaIdChange(e.target.value)}
              />
              <select
                className="form-select form-select-sm"
                style={{ fontSize: "0.72rem", marginBottom: 8 }}
                value={testCourseId || ""}
                onChange={(e) => {
                  setTestCourseId(e.target.value);
                  savePersisted("test_course_id", e.target.value);
                }}
              >
                <option value="">Сценарий (курс)</option>
                {courses.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} ({c.captcha_count})
                  </option>
                ))}
              </select>
              <label style={{ fontSize: "0.75rem", color: "#8b949e", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  className="form-check-input"
                  style={{ margin: 0 }}
                  checked={testNoTimeout}
                  onChange={(e) => handleNoTimeoutChange(e.target.checked)}
                />
                Без таймаута
              </label>
              <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }} />
              <label style={{ fontSize: "0.75rem", color: "#8b949e", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  className="form-check-input"
                  style={{ margin: 0 }}
                  checked={sequentialIcons}
                  onChange={(e) => handleSequentialIconsChange(e.target.checked)}
                />
                Иконки по очереди
              </label>
            </div>
          )}
        </div>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => handleTestRun(testCourseId ? 0 : 1)}
          disabled={loading}
          title={testCourseId ? "Запустить все капчи курса" : "1 случайная капча"}
        >
          {loading ? "Запуск..." : testCourseId ? "Сценарий" : "Тест"}
        </button>
        <Link to="/admin" className="btn btn-sm btn-outline-secondary">
          Админ
        </Link>
        {isAdmin && (
          <button
            className={`btn btn-sm ${superKioskMode ? "btn-warning" : "btn-outline-secondary"}`}
            onClick={() => setSuperKioskMode(!superKioskMode)}
            title={superKioskMode ? "Отключить Супер Киоск" : "Включить Супер Киоск"}
            style={{ fontSize: "0.75rem" }}
          >
            {superKioskMode ? "Супер Киоск ✓" : "Супер Киоск"}
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(StatusBar);
