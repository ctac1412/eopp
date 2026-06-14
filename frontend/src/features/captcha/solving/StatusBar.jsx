import React, { useState, useEffect, useRef } from "react";
import { formatMoney } from "../../../utils/format";
import useCaptchaStore from "../../../store/useCaptchaStore";
import { Button, CheckboxField, SelectInput, TextInput } from "../../../ui";

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
  const [autoSolveRucaptcha, setAutoSolveRucaptcha] = useState(() => loadPersisted("auto_solve_rucaptcha", "0") === "1");
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);
  const connectedOperators = useCaptchaStore((s) => s.connectedOperators);
  const sseConnected = useCaptchaStore((s) => s.sseConnected);
  const operatorCount = Array.isArray(connectedOperators) ? connectedOperators.filter((operator) => operator.online).length : 0;
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
    setIsAdmin(localStorage.getItem("admin_session_active") === "1");
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

  const handleAutoSolveRucaptchaChange = (val) => {
    setAutoSolveRucaptcha(val);
    savePersisted("auto_solve_rucaptcha", val ? "1" : "0");
  };

  const handleTestRun = async (count = 1) => {
    setLoading(true);
    setShowSettings(false);
    try {
      const body = { api_key: apiKey };
      if (testCaptchaId) body.captcha_id = testCaptchaId;
      if (testCourseId) body.course_id = testCourseId;
      if (testNoTimeout) body.test_no_timeout = true;
      if (autoSolveRucaptcha) body.auto_solve_rucaptcha = true;
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
    fetch("/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("admin_session_active");
    localStorage.removeItem("admin_role");
    localStorage.removeItem("admin_sections");
    localStorage.removeItem("admin_permissions");
    clearApiKey();
    setShowChange(false);
  };

  const localMode = isLocalhost();

  const openTestPage = (path) => {
    const url = `${window.location.origin}${path}`;
    window.open(url, "_blank");
  };

  const truncatedId = testCaptchaId.length > 16
    ? `${testCaptchaId.slice(0, 16)}…`
    : testCaptchaId;
  const courseOptions = [
    { value: "", label: "Сценарий (курс)" },
    ...courses.map((course) => ({
      value: String(course.id),
      label: `${course.name} (${course.captcha_count})`,
    })),
  ];

  return (
    <div data-eopp-component="StatusBar" className="status-bar status-bar--design">
      <div className="status-bar__state">
        <span className={`status-dot ${sseError ? "status-dot--error" : isActive || sseConnected ? "status-dot--active" : "status-dot--idle"}`} />
        {isActive && (
          <span className="status-bar__active">
            <span>Активная:</span>
            <strong>{activeId}</strong>
          </span>
        )}
        {!isActive && !sseError && (
          <span className={`status-bar__connection ${sseConnected ? "is-connected" : ""}`}>
            {sseConnected ? "Подключено" : "Ожидание..."}
          </span>
        )}
        {sseError && (
          <>
            <span className="status-bar__error">{sseError}</span>
            {sseError.includes("Другое подключение") && (
              <Button
                data-eopp-component="StatusBarForceReconnectButton"
                size="small"
                variant="primary"
                onClick={() => {
                  const store = useCaptchaStore.getState();
                  store.setPendingForceReconnect(true);
                  store.triggerReconnect();
                }}
              >
                Перехватить
              </Button>
            )}
          </>
        )}
        {localMode && <span className="local-tag">LOCAL</span>}
        {superKioskMode && isAdmin && <span className="super-kiosk-tag">СУПЕР</span>}
        {operatorCount > 0 && <span className="api-key-limit">Операторы: {operatorCount}</span>}
      </div>

      <div className="status-bar__actions">
        {apiPriceCreate != null && (
          <span className="tariff-badge tariff-badge--create">{formatMoney(apiPriceCreate)}</span>
        )}
        {apiPriceReschedule != null && (
          <span className="tariff-badge tariff-badge--reschedule">{formatMoney(apiPriceReschedule)}</span>
        )}
        {apiKey && (
          <div className="status-bar__key">
            <span className="api-key">{apiLabel || maskKey(apiKey)}</span>
            {apiRemaining != null ? (
              <span className="api-key-limit">
                {apiMaxUses != null ? `${apiRemaining}/${apiMaxUses}` : `${apiRemaining}`}
              </span>
            ) : (
              <span className="api-key-limit api-key-limit--unlimited">Безлимит</span>
            )}
            {showChange ? (
              <div className="status-bar__confirm">
                <Button size="small" variant="primary" onClick={handleClearKey}>ОК</Button>
                <Button size="small" onClick={() => setShowChange(false)}>Отмена</Button>
              </div>
            ) : (
              <Button size="small" onClick={() => setShowChange(true)}>Выйти</Button>
            )}
          </div>
        )}
        {localMode && (
          <div className="status-bar__test-pages">
            <Button size="small" onClick={() => openTestPage("/test-injector/edit")}>Создание</Button>
            <Button size="small" onClick={() => openTestPage("/test-injector/reschedule")}>Перенос</Button>
          </div>
        )}
        <div className="status-bar__settings" ref={settingsRef}>
          {testCaptchaId && (
            <span className="api-key-limit status-bar__test-id" title={testCaptchaId}>
              {truncatedId}
            </span>
          )}
          <Button
            data-eopp-component="StatusBarSettingsButton"
            size="small"
            variant={showSettings ? "primary" : "secondary"}
            onClick={() => setShowSettings(!showSettings)}
            title="Настройки тестового запуска"
          >
            Настр.
          </Button>
          {showSettings && (
            <div data-eopp-component="StatusBarSettingsPanel" className="status-bar__settings-panel">
              <div className="status-bar__settings-title">Настройки тестового запуска</div>
              <TextInput
                data-eopp-component="StatusBarCaptchaIdInput"
                className="status-bar__settings-input"
                placeholder="ID капчи (пусто = случайная)"
                value={testCaptchaId}
                onChange={(event) => handleCaptchaIdChange(event.target.value)}
              />
              <SelectInput
                data-eopp-component="StatusBarCourseSelect"
                className="status-bar__settings-select"
                value={testCourseId || ""}
                onChange={(value) => {
                  const nextValue = value || "";
                  setTestCourseId(nextValue);
                  savePersisted("test_course_id", nextValue);
                }}
                options={courseOptions}
                allowClear={false}
              />
              <div className="status-bar__settings-checks">
                <CheckboxField
                  checked={testNoTimeout}
                  onChange={(event) => handleNoTimeoutChange(event.target.checked)}
                >
                  Без таймаута
                </CheckboxField>
                <CheckboxField
                  checked={sequentialIcons}
                  onChange={(event) => handleSequentialIconsChange(event.target.checked)}
                >
                  Иконки по очереди
                </CheckboxField>
                <CheckboxField
                  checked={autoSolveRucaptcha}
                  onChange={(event) => handleAutoSolveRucaptchaChange(event.target.checked)}
                >
                  RuCaptcha авто-солв
                </CheckboxField>
              </div>
            </div>
          )}
        </div>
        <Button
          data-eopp-component="StatusBarRunTestButton"
          size="small"
          variant="primary"
          onClick={() => handleTestRun(testCourseId ? 0 : 1)}
          disabled={loading}
          loading={loading}
          title={testCourseId ? "Запустить все капчи курса" : "1 случайная капча"}
        >
          {testCourseId ? "Сценарий" : "Тест"}
        </Button>
        <Button data-eopp-component="StatusBarAdminButton" size="small" href="/admin">
          Админ
        </Button>
        {isAdmin && (
          <Button
            data-eopp-component="StatusBarSuperKioskButton"
            size="small"
            variant={superKioskMode ? "primary" : "secondary"}
            onClick={() => setSuperKioskMode(!superKioskMode)}
            title={superKioskMode ? "Отключить Супер Киоск" : "Включить Супер Киоск"}
          >
            {superKioskMode ? "Супер Киоск ✓" : "Супер Киоск"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default React.memo(StatusBar);
