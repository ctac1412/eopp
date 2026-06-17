import React from "react";
import PuzzleVariantCard from "./PuzzleVariantCard";
import { getPuzzleVariantOrder } from "./puzzleVariantOrder";

function PuzzleVariantGrid({
  entry,
  reverse = false,
  selectedVariant,
  solved = false,
  solvedLabel,
  onSelectVariant,
}) {
  const order = React.useMemo(
    () =>
      getPuzzleVariantOrder({
        variants: entry?.variants || [],
        top3: entry?.top3 || [],
        reverse,
      }),
    [entry?.variants, entry?.top3, reverse],
  );

  return (
    <div className="captcha-panel__body captcha-panel__body--variants">
      <div className="captcha-variants-grid">
        {order.map((variantIndex) => (
          <div key={`${entry.id || entry.captchaId}-${variantIndex}`}>
            <PuzzleVariantCard
              entry={entry}
              variantIndex={variantIndex}
              selected={selectedVariant === variantIndex}
              solved={solved}
              solvedLabel={solvedLabel}
              onSelect={() => onSelectVariant?.(variantIndex)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(PuzzleVariantGrid);
