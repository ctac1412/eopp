import React, { useState, useCallback, useEffect, useRef } from "react";
import { useInjectorStore } from "@/store";
import { getApiKeyStatus } from "@/api/background";

interface Props {
  onClose: () => void;
}

const AuthGate = React.memo(function AuthGate({ onClose }: Props) {
  const authKey = useInjectorStore((s) => s.authKey);
  const authKeyStatus = useInjectorStore((s) => s.authKeyStatus);
  const setAuthKey = useInjectorStore((s) => s.setAuthKey);
  const setAuthKeyStatus = useInjectorStore((s) => s.setAuthKeyStatus);
  const clearAuthKey = useInjectorStore((s) => s.clearAuthKey);
  const setAuthLoading = useInjectorStore((s) => s.setAuthLoading);
  const setAuthError = useInjectorStore((s) => s.setAuthError);
  const setAuthChecking = useInjectorStore((s) => s.setAuthChecking);
  const authLoading = useInjectorStore((s) => s.authLoading);
  const authError = useInjectorStore((s) => s.authError);
  const authChecking = useInjectorStore((s) => s.authChecking);
  const updateField = useInjectorStore((s) => s.updateField);

  const [inputKey, setInputKey] = useState("");
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    if (authKey && !authKeyStatus) {
      setAuthChecking(true);
      getApiKeyStatus(authKey)
        .then((status) => {
          if (status.valid) {
            setAuthKeyStatus(status);
          } else {
            clearAuthKey();
            updateField("apiKey", "");
            localStorage.removeItem("_k");
            setAuthError("Недействительный ключ");
          }
        })
        .catch(() => {
          clearAuthKey();
          updateField("apiKey", "");
          localStorage.removeItem("_k");
          setAuthError("Не удалось подключиться к серверу");
        })
        .finally(() => {
          setAuthChecking(false);
        });
    }
  }, [authKey, authKeyStatus]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputKey.trim();
      if (!trimmed) {
        setAuthError("Введите ключ");
        return;
      }
      setAuthLoading(true);
      try {
        const status = await getApiKeyStatus(trimmed);
        if (status.valid) {
          setAuthKey(trimmed);
          setAuthKeyStatus(status);
          updateField("apiKey", trimmed);
          localStorage.setItem("_k", trimmed);
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
    localStorage.removeItem("_k");
    setInputKey("");
  }, [clearAuthKey, updateField]);

  if (authChecking) {
    return (
      <div className="qn-auth-gate-overlay">
        <button className="qn-auth-gate-close" onClick={onClose}>
          &times;
        </button>
        <div className="qn-auth-gate-card">
          <div className="qn-auth-gate-title">Помощник</div>
          <div className="qn-auth-gate-subtitle">
            Проверка подключения...
          </div>
          <div className="qn-auth-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="qn-auth-gate-overlay">
      <button className="qn-auth-gate-close" onClick={onClose}>
        &times;
      </button>
      <div className="qn-auth-gate-card">
        <div className="qn-auth-gate-title">Помощник</div>
        <div className="qn-auth-gate-subtitle">
          {authError
            ? authError
            : "Авторизация для синхронизации заметок"}
        </div>
        <form className="qn-auth-gate-form" onSubmit={handleLogin}>
          <input
            className="qn-auth-gate-input"
            type="text"
            placeholder="Ключ синхронизации"
            value={inputKey}
            onChange={(e) => {
              setInputKey(e.target.value);
              setAuthError("");
            }}
            autoFocus
          />
          {authError && (
            <div className="qn-auth-gate-error">{authError}</div>
          )}
          <button
            className="qn-auth-gate-btn"
            type="submit"
            disabled={authLoading}
          >
            {authLoading ? "Проверка..." : "Подключить"}
          </button>
        </form>
        {authKey && !authError && (
          <button
            className="qn-auth-gate-logout"
            onClick={handleLogout}
          >
            Сбросить ключ
          </button>
        )}
      </div>
    </div>
  );
});

export default AuthGate;
