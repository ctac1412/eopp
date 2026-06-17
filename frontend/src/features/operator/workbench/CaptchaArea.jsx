import React from "react";
import {
  CaptchaClickSurface,
  CaptchaIconStrip,
  CaptchaProgressDots,
} from "../../captcha/solving/CaptchaClickSurface";
import PuzzleVariantGrid from "../../captcha/shared/PuzzleVariantGrid";

export default function CaptchaArea({
  active,
  iconDisplayMode,
  handleClick,
  handlePuzzleAnswer,
  queueLen,
}) {
  const waiting = active?.waiting;
  const complete = active?.complete;
  const hasCaptchaImage = active?.mainImage && !waiting && !complete;
  const hasPuzzle =
    active?.variants?.length > 0 &&
    active?.captchaType !== 1 &&
    !waiting &&
    !complete;

  return (
    <div className="op-captcha">
      <div className="op-captcha__image-area">
        {hasPuzzle ? (
          <PuzzleVariantGrid
            entry={active}
            reverse
            solved={complete}
            solvedLabel="Решено"
            onSelectVariant={handlePuzzleAnswer}
          />
        ) : hasCaptchaImage ? (
          <CaptchaClickSurface
            image={active.mainImage}
            markers={[...active.markers, ...active.foreignMarkers]}
            className="op-captcha__image-wrapper"
            imageClassName="op-captcha__image"
            onCoordinateClick={handleClick}
          />
        ) : (
          <div className="op-captcha__idle">
            <div className="idle-spinner" style={{ margin: "0 auto" }} />
            <div className="op-captcha__idle-text">
              {complete
                ? "Капча решена, ожидание следующей..."
                : waiting
                  ? "Иконки пройдены, ожидание..."
                  : queueLen > 0
                    ? `В очереди: ${queueLen}`
                    : "Ожидание новой капчи..."}
            </div>
          </div>
        )}
      </div>

      {hasCaptchaImage && (
        <>
          <CaptchaIconStrip
            icons={active.allIcons}
            assigned={active.assigned}
            currentPosition={active.currentPos}
            answeredPositions={active.answeredPositions}
            iconDisplayMode={iconDisplayMode}
            className="op-captcha__icons-strip"
          />
          <CaptchaProgressDots
            assigned={active.assigned}
            answeredPositions={active.answeredPositions}
            currentPosition={active.currentPos}
            iconDisplayMode={iconDisplayMode}
          />
        </>
      )}
    </div>
  );
}
