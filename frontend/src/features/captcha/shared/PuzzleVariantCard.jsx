import React from "react";
import { StatusTag } from "../../../ui";
import PuzzleVariantTiles from "./PuzzleVariantTiles";

function PuzzleVariantCard({
  entry,
  variantIndex,
  selected = false,
  solved = false,
  solvedLabel,
  onSelect,
}) {
  const top3 = entry.top3 || [];
  const rank = top3.indexOf(String(variantIndex));
  const isTopRanked = rank === 0 && !solved;
  const style = isTopRanked
    ? {
        border: entry.confident ? "4px solid #28a745" : "3px solid #28a745",
        borderRadius: "8px",
        boxShadow: entry.confident
          ? "0 0 16px rgba(40,167,69,0.7)"
          : "0 0 6px rgba(40,167,69,0.3)",
      }
    : undefined;

  return (
    <div
      className={`captcha-card position-relative ${selected ? "captcha-card--selected" : ""} ${solved ? "captcha-card--solved" : ""}`}
      data-index={variantIndex}
      onClick={solved ? undefined : onSelect}
      style={style}
    >
      {solved && solvedLabel && (
        <div
          className="position-absolute"
          style={{ top: "6px", left: "6px", zIndex: 2 }}
        >
          <StatusTag
            status="confirmed"
            label={solvedLabel}
            style={{ fontSize: "0.65rem", marginInlineEnd: 0 }}
          />
        </div>
      )}
      <PuzzleVariantTiles
        entry={entry}
        index={variantIndex}
        style={solved ? { opacity: 0.5 } : {}}
      />
      <div
        className={`captcha-card__footer ${isTopRanked ? "is-top-ranked" : ""}`}
      >
        #{variantIndex}
        {isTopRanked && entry.confident && (
          <span className="captcha-card__auto">AUTO 100%</span>
        )}
      </div>
    </div>
  );
}

export default React.memo(PuzzleVariantCard);
