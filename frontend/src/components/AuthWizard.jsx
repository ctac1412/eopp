import React, { useState } from "react";
import useCaptchaStore from "../store/useCaptchaStore";

function AuthWizard() {
  const setApiKey = useCaptchaStore((s) => s.setApiKey);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Введите API ключ");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(
        `/validate-key?api_key=${encodeURIComponent(trimmed)}`,
      );
      const data = await resp.json();
      if (data.valid) {
        setApiKey(trimmed);
      } else {
        setError(data.reason || "Неверный API ключ");
      }
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-box p-4" style={{ maxWidth: "400px", width: "100%" }}>
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
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h5 className="mb-1 fw-bold" style={{ fontSize: "1.125rem" }}>EOPP Captcha Solver</h5>
          <p className="text-muted mb-0" style={{ fontSize: "0.8125rem" }}>
            Введите API ключ киоска для начала работы
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <input
              className="form-control"
              type="text"
              placeholder="API ключ"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError("");
              }}
              autoFocus
            />
          </div>
          {error && (
            <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
          <button
            className="btn btn-primary w-100"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" />
                Проверка...
              </>
            ) : (
              "Подключиться"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthWizard;
