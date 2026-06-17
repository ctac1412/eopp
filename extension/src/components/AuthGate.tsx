import React, { useCallback, useEffect, useRef } from "react";
import { useInjectorStore } from "@/store";
import { getApiKeyStatus } from "@/api/background";

interface Props {
  onClose: () => void;
}

const AuthGate = React.memo(function AuthGate({ onClose }: Props) {
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

  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    if (!authKeyStatus) {
      setAuthChecking(true);
      getApiKeyStatus()
        .then((status) => {
          if (status.valid) {
            setAuthKey("cookie-session");
            setAuthKeyStatus(status);
            updateField("apiKey", "");
          } else {
            clearAuthKey();
            updateField("apiKey", "");
            localStorage.removeItem("_k");
            setAuthError("Нет активной сессии на сервере");
          }
        })
        .catch(() => {
          clearAuthKey();
          updateField("apiKey", "");
          localStorage.removeItem("_k");
          setAuthError("Откройте сервер и войдите в аккаунт");
        })
        .finally(() => {
          setAuthChecking(false);
        });
    }
  }, [authKeyStatus]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthLoading(true);
      try {
        const status = await getApiKeyStatus();
        if (status.valid) {
          setAuthKey("cookie-session");
          setAuthKeyStatus(status);
          updateField("apiKey", "");
        } else {
          setAuthError("Нет активной сессии на сервере");
        }
      } catch {
        setAuthError("Откройте сервер и войдите в аккаунт");
      }
    },
    [setAuthKey, setAuthLoading, setAuthError, updateField],
  );

  const handleLogout = useCallback(() => {
    clearAuthKey();
    updateField("apiKey", "");
    localStorage.removeItem("_k");
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
        {authKeyStatus && !authError && (
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
