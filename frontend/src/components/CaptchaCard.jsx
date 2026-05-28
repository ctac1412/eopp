import React from "react";
import useCaptchaStore from "../store/useCaptchaStore";

function CaptchaCard({ entry, index }) {
  const isSelected = useCaptchaStore(
    (s) => s.selectedCard === index && s.selectedCaptchaId === entry.id,
  );
  const setSelectedCard = useCaptchaStore((s) => s.setSelectedCard);
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);
  const apiKey = useCaptchaStore((s) => s.apiKey);

  const handleClick = async () => {
    setSelectedCard(entry.id, index);

    const res = await fetch("/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captcha_id: entry.id,
        variantIndex: parseInt(index),
        api_key: apiKey,
      }),
    });
    const data = await res.json();

    if (data.already_solved) {
      useCaptchaStore.getState().markSolved(entry.id);
      useCaptchaStore
        .getState()
        .addLog(
          `Капча ${entry.id} уже решена другим киоском`,
          "info",
        );
      return;
    }

    useCaptchaStore.getState().markSolved(entry.id, superKioskMode, null);
    const solverInfo = superKioskMode && entry.ownerLabel
      ? `Супер Киоск → ${entry.ownerLabel}`
      : superKioskMode
      ? "Супер Киоск"
      : "Локально";
    useCaptchaStore
      .getState()
      .addLog(
        `Решено [${solverInfo}]: ${entry.id} → #${index}  (${data.resultFile})`,
        "success",
      );
  };

  const rank = entry.top3.indexOf(String(index));

  return (
    <div
      className={`captcha-card position-relative ${isSelected ? "captcha-card--selected" : ""} ${entry.solved ? "captcha-card--solved" : ""}`}
      data-index={index}
      onClick={entry.solved ? undefined : handleClick}
      style={rank === 0 && !entry.solved ? {
        border: entry.confident ? "4px solid #28a745" : "3px solid #28a745",
        borderRadius: "8px",
        boxShadow: entry.confident
          ? "0 0 16px rgba(40,167,69,0.7)"
          : "0 0 6px rgba(40,167,69,0.3)",
      } : undefined}
    >
      {rank === 0 && !entry.solved && (
        <div className="position-absolute" style={{ top: "4px", right: "4px", zIndex: 2 }}>
          <span className="badge bg-success" style={{ fontSize: "0.6rem" }}>
            {entry.confident ? "100% ✓" : "100%"}
          </span>
        </div>
      )}
      {entry.solved && (
        <div className="position-absolute" style={{ top: "6px", left: "6px", zIndex: 2 }}>
          <span className="badge bg-success" style={{ fontSize: "0.65rem" }}>
            {entry.solvedBySuper ? `Супер: ${entry.solverLabel || "?"}` : "Решено"}
          </span>
        </div>
      )}
      <img
        className="captcha-card__img"
        src={"data:image/png;base64," + entry.images[index]}
        alt={`Вариант ${index}`}
        style={entry.solved ? { opacity: 0.5 } : {}}
      />
      <div className="text-center py-2" style={{
        fontSize: "0.75rem",
        color: "#484f58",
        borderTop: "1px solid var(--border)",
        background: "var(--surface-raised)",
        fontFamily: "var(--bs-font-monospace)",
      }}>
        #{index}
      </div>
    </div>
  );
}

export default React.memo(CaptchaCard);
