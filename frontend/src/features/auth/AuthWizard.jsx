import React, { useState } from "react";
import { Alert } from "antd";
import useCaptchaStore from "../../store/useCaptchaStore";
import { Button, TextInput } from "../../ui";

function AuthWizard() {
  const setApiKey = useCaptchaStore((s) => s.setApiKey);
  const setApiKeyInfo = useCaptchaStore((s) => s.setApiKeyInfo);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedLogin = login.trim();
    if (!trimmedLogin || !password) {
      setError("Введите логин и пароль");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const loginResp = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: trimmedLogin, password }),
      });
      const loginData = await loginResp.json();
      if (!loginResp.ok) {
        setError(loginData.error || "Неверные данные входа");
        return;
      }

      localStorage.setItem("admin_session_active", "1");
      localStorage.setItem("admin_role", loginData.role || "");
      localStorage.setItem("admin_sections", JSON.stringify(loginData.sections || []));
      localStorage.setItem("admin_permissions", JSON.stringify(loginData.permissions || []));

      const keysResp = await fetch("/auth/plugin-keys");
      const keysData = await keysResp.json();
      if (!keysResp.ok) {
        setError(keysData.error || "Не удалось загрузить ключи пользователя");
        return;
      }

      const keys = Array.isArray(keysData.keys) ? keysData.keys : [];
      const firstKey = keys[0];
      if (!firstKey?.key) {
        setError("У пользователя нет активного ключа для работы");
        return;
      }

      setApiKey(firstKey.key);
      setApiKeyInfo(firstKey.id, firstKey.label || "");
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-eopp-component="AuthWizard" className="auth-bg">
      <div
        data-eopp-component="AuthWizardBox"
        className="auth-box p-4"
        style={{ maxWidth: "400px", width: "100%" }}
      >
        <div className="text-center mb-4">
          <div
            className="d-inline-flex align-items-center justify-content-center mb-3"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "0.75rem",
              background: "var(--accent)",
              boxShadow: "0 0 20px var(--accent-glow)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h5 className="mb-1 fw-bold" style={{ fontSize: "1.125rem" }}>EOPP Captcha Solver</h5>
          <p className="text-muted mb-0" style={{ fontSize: "0.8125rem" }}>
            Введите логин и пароль для начала работы
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <TextInput
              data-eopp-component="AuthWizardLoginInput"
              className="auth-wizard__input"
              type="text"
              placeholder="Логин"
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                setError("");
              }}
              autoFocus
            />
          </div>
          <div className="mb-3">
            <TextInput
              data-eopp-component="AuthWizardPasswordInput"
              className="auth-wizard__input"
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
            />
          </div>
          {error && (
            <Alert
              data-eopp-component="AuthWizardError"
              className="auth-wizard__error"
              type="error"
              showIcon
              message={error}
            />
          )}
          <Button
            data-eopp-component="AuthWizardSubmitButton"
            className="auth-wizard__submit"
            variant="primary"
            htmlType="submit"
            disabled={loading}
            loading={loading}
          >
            {loading ? "Проверка..." : "Войти"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default AuthWizard;
