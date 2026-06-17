import { captchaService } from "./api/captchaService";
import React from "react";
import useCaptchaStore from "../../../store/useCaptchaStore";
import { StatusTag } from "../../../ui";

function CaptchaCard({ entry, index }) {
  const isSelected = useCaptchaStore(
    (s) => s.selectedCard === index && s.selectedCaptchaId === entry.id,
  );
  const setSelectedCard = useCaptchaStore((s) => s.setSelectedCard);
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);

  const handleClick = async () => {
    setSelectedCard(entry.id, index);

    const res = await captchaService.solve({
      captcha_id: entry.id,
      variantIndex: parseInt(index),
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
      {entry.solved && (
        <div className="position-absolute" style={{ top: "6px", left: "6px", zIndex: 2 }}>
          <StatusTag
            status="confirmed"
            label={entry.solvedBySuper ? `Супер: ${entry.solverLabel || "?"}` : "Решено"}
            style={{ fontSize: "0.65rem", marginInlineEnd: 0 }}
          />
        </div>
      )}
      <img
        className="captcha-card__img"
        src={"data:image/png;base64," + entry.images[index]}
        alt={`Вариант ${index}`}
        style={entry.solved ? { opacity: 0.5 } : {}}
      />
      <div
        className={`captcha-card__footer ${rank === 0 && !entry.solved ? "is-top-ranked" : ""}`}
      >
        #{index}
        {rank === 0 && entry.confident && !entry.solved && (
          <span className="captcha-card__auto">
            AUTO 100%
          </span>
        )}
      </div>
    </div>
  );
}

export default React.memo(CaptchaCard);
