import React from "react";

/**
 * Попап проверки готовности для оператора.
 *
 * Пропсы:
 *   readinessCheck — объект { countdown, timer } | null
 *   handleReadyClick — () => void
 */
export default function ReadinessPopup({ readinessCheck, handleReadyClick }) {
  if (!readinessCheck) return null;

  return (
    <div className="op-readiness-overlay">
      <div className="op-readiness-box">
        <div className="op-readiness__title">
          Проверка готовности
        </div>
        <div
          className="op-readiness__timer"
          style={{
            color: readinessCheck.timer <= 5 ? "#f85149" : "#d29922",
          }}
        >
          {readinessCheck.timer}
        </div>
        <button onClick={handleReadyClick} className="op-readiness__btn">
          Готов
        </button>
      </div>
    </div>
  );
}
