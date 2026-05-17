import React from "react";
import { Link } from "react-router-dom";

export function AdminAuth({ authInput, setAuthInput, authError, authLoading, onAuth }) {
  return (
    <div className="auth-bg">
      <div className="auth-box p-4" style={{ maxWidth: "380px", width: "100%" }}>
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
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h5 className="mb-1 fw-bold" style={{ fontSize: "1.125rem" }}>Админ-панель</h5>
          <p className="text-muted mb-0" style={{ fontSize: "0.8125rem" }}>
            Введите ADMIN_TOKEN для доступа
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAuth();
          }}
        >
          <div className="mb-3">
            <input
              type="password"
              className="form-control"
              value={authInput}
              onChange={(e) => setAuthInput(e.target.value)}
              placeholder="Токен"
              required
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-100"
            disabled={authLoading}
          >
            {authLoading ? "Проверка…" : "Войти"}
          </button>
        </form>
        {authError && <div className="alert alert-danger mt-3 mb-0 py-2" style={{ fontSize: "0.8125rem" }}>{authError}</div>}
        <div className="text-center mt-3">
          <Link to="/" className="btn btn-sm btn-outline-secondary">← Назад к капчам</Link>
        </div>
      </div>
    </div>
  );
}
