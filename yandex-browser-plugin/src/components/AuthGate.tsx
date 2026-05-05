import React, { useState, useCallback } from "react";
import { useInjectorStore } from "@/store";
import { getApiKeyStatus } from "@/api/background";

interface Props {
  onClose: () => void;
}

const AuthGate = React.memo(function AuthGate({ onClose }: Props) {
  const authKey = useInjectorStore((s) => s.authKey);
  const setAuthKey = useInjectorStore((s) => s.setAuthKey);
  const clearAuthKey = useInjectorStore((s) => s.clearAuthKey);
  const setAuthLoading = useInjectorStore((s) => s.setAuthLoading);
  const setAuthError = useInjectorStore((s) => s.setAuthError);
  const authLoading = useInjectorStore((s) => s.authLoading);
  const authError = useInjectorStore((s) => s.authError);
  const updateField = useInjectorStore((s) => s.updateField);

  const [inputKey, setInputKey] = useState("");

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputKey.trim();
      if (!trimmed) {
        setAuthError("Введите API ключ");
        return;
      }
      setAuthLoading(true);
      try {
        const status = await getApiKeyStatus(trimmed);
        if (status.valid) {
          setAuthKey(trimmed);
          updateField("apiKey", trimmed);
          localStorage.setItem("injector_api_key", trimmed);
        } else {
          setAuthError("Недействительный ключ");
        }
      } catch {
        setAuthError("Не удалось подключиться к серверу");
      }
    },
    [inputKey, setAuthKey, setAuthLoading, setAuthError, updateField],
  );

  const handleLogout = useCallback(() => {
    clearAuthKey();
    updateField("apiKey", "");
    localStorage.removeItem("injector_api_key");
    setInputKey("");
  }, [clearAuthKey, updateField]);

  const maskKey = (key: string) => {
    if (key.length <= 2) return "••••";
    return key[0] + "•".repeat(key.length - 2) + key[key.length - 1];
  };

  return (
    <div className="injector-auth-gate-overlay">
      <button className="injector-auth-gate-close" onClick={onClose}>
        &times;
      </button>
      <div className="injector-auth-gate-card">
        <div className="injector-auth-gate-title">EOPP Injector</div>
        <div className="injector-auth-gate-subtitle">
          Введите API ключ для начала работы
        </div>
        <form className="injector-auth-gate-form" onSubmit={handleLogin}>
          <input
            className="injector-auth-gate-input"
            type="text"
            placeholder="API ключ"
            value={inputKey}
            onChange={(e) => {
              setInputKey(e.target.value);
              setAuthError("");
            }}
            autoFocus
          />
          {authError && (
            <div className="injector-auth-gate-error">{authError}</div>
          )}
          <button
            className="injector-auth-gate-btn"
            type="submit"
            disabled={authLoading}
          >
            {authLoading ? "Проверка..." : "Войти"}
          </button>
        </form>
        {authKey && (
          <div className="injector-auth-gate-logged">
            <span>Ключ: {maskKey(authKey)}</span>
            <button
              className="injector-auth-gate-logout"
              onClick={handleLogout}
            >
              Выйти
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default AuthGate;
