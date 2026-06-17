import { captchaService } from "./api/captchaService";
import React from "react";
import PuzzleVariantCard from "../shared/PuzzleVariantCard";
import useCaptchaStore from "../../../store/useCaptchaStore";

function CaptchaCard({ entry, index }) {
  const variantIndex = parseInt(index, 10);
  const isSelected = useCaptchaStore(
    (s) => s.selectedCard === String(index) && s.selectedCaptchaId === entry.id,
  );
  const setSelectedCard = useCaptchaStore((s) => s.setSelectedCard);
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);

  const handleClick = async () => {
    setSelectedCard(entry.id, String(index));

    const res = await captchaService.solve({
      captcha_id: entry.id,
      variantIndex,
    });
    const data = await res.json();

    if (data.already_solved) {
      useCaptchaStore.getState().markSolved(entry.id);
      useCaptchaStore
        .getState()
        .addLog(`Капча ${entry.id} уже решена другим киоском`, "info");
      return;
    }

    useCaptchaStore.getState().markSolved(entry.id, superKioskMode, null);
    const solverInfo =
      superKioskMode && entry.ownerLabel
        ? `Супер Киоск -> ${entry.ownerLabel}`
        : superKioskMode
          ? "Супер Киоск"
          : "Локально";
    useCaptchaStore
      .getState()
      .addLog(
        `Решено [${solverInfo}]: ${entry.id} -> #${index}  (${data.resultFile})`,
        "success",
      );
  };

  return (
    <PuzzleVariantCard
      entry={entry}
      variantIndex={variantIndex}
      selected={isSelected}
      solved={entry.solved}
      solvedLabel={
        entry.solvedBySuper ? `Супер: ${entry.solverLabel || "?"}` : "Решено"
      }
      onSelect={handleClick}
    />
  );
}

export default React.memo(CaptchaCard);
