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
    <div className="auth-wizard">
      <div className="auth-wizard__card">
        <div className="auth-wizard__title">EOPP Captcha Solver</div>
        <div className="auth-wizard__subtitle">
          Введите API ключ киоска для начала работы
        </div>
        <form className="auth-wizard__form" onSubmit={handleSubmit}>
          <input
            className="auth-wizard__input"
            type="text"
            placeholder="API ключ"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError("");
            }}
            autoFocus
          />
          {error && <div className="auth-wizard__error">{error}</div>}
          <button className="auth-wizard__btn" type="submit" disabled={loading}>
            {loading ? "Проверка..." : "Подключиться"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthWizard;
