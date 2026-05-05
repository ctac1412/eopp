import React from "react";
import { Link } from "react-router-dom";

export function AdminAuth({ authInput, setAuthInput, authError, authLoading, onAuth }) {
  return (
    <div className="admin-page">
      <div className="admin-auth-wrapper">
        <div className="admin-auth-box">
          <h2>Админ-панель</h2>
          <p className="admin-auth-desc">Введите ADMIN_TOKEN для доступа</p>
          <form
            className="admin-auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              onAuth();
            }}
          >
            <input
              type="password"
              value={authInput}
              onChange={(e) => setAuthInput(e.target.value)}
              placeholder="Token"
              className="input"
              required
              autoFocus
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={authLoading}
            >
              {authLoading ? "Проверка…" : "Войти"}
            </button>
          </form>
          {authError && <div className="admin-auth-error">{authError}</div>}
          <Link
            to="/"
            className="back-link"
            style={{ marginTop: "10px", display: "inline-block" }}
          >
            ← Назад к капчам
          </Link>
        </div>
      </div>
    </div>
  );
}