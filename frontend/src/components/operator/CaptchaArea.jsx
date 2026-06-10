import React from "react";

/**
 * CaptchaArea — область капчи для оператора.
 *
 * Props:
 *   active          — текущая запись капчи (null когда idle)
 *   iconDisplayMode — "own_only" | "own_all" | null
 *   naturalSize     — { w, h } | null
 *   imgRef          — ref на <img>
 *   handleClick     — (e) => void
 *   onImgLoad       — (e) => void  (чтобы родитель мог установить naturalSize)
 *   queueLen        — длина очереди капч (для idle-текста)
 */
export default function CaptchaArea({
  active,
  iconDisplayMode,
  naturalSize,
  imgRef,
  handleClick,
  onImgLoad,
  queueLen,
}) {
  const colors = ["#dc3545", "#fd7e14", "#ffc107", "#198754", "#0d6efd"];

  const waiting = active?.waiting;
  const complete = active?.complete;

  return (
    <div className="op-captcha">
      {/* Изображение + маркеры (или idle-состояние) */}
      <div className="op-captcha__image-area">
        {active?.mainImage && !waiting && !complete ? (
          <div className="op-captcha__image-wrapper">
            <img
              ref={imgRef}
              src={"data:image/png;base64," + active.mainImage}
              alt="Капча"
              onLoad={onImgLoad}
              onClick={handleClick}
              className="op-captcha__image"
              draggable={false}
            />
            {naturalSize &&
              [...active.markers, ...active.foreignMarkers].map((m, i) => {
                const label = m.label != null ? m.label : i + 1;
                const colorIdx = (m.label != null ? m.label - 1 : i) % colors.length;
                return (
                  <div
                    key={i}
                    className="op-captcha__marker"
                    style={{
                      left: `${((m.x / naturalSize.w) * 100).toFixed(2)}%`,
                      top: `${((m.y / naturalSize.h) * 100).toFixed(2)}%`,
                    }}
                  >
                    <div
                      className="op-captcha__marker-circle"
                      style={{ background: colors[colorIdx] }}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
          </div>
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

      {/* Иконки + точки — только когда есть active.mainImage */}
      {active?.mainImage && !waiting && !complete && (
        <>
          {/* Иконки-полоска */}
          {active.allIcons.length > 0 && (
            <div className="op-captcha__icons-strip">
              {active.allIcons
                .filter((ic) => iconDisplayMode !== "own_only" || active.assigned.includes(ic.position))
                .map((ic) => {
                  const isCurrent = ic.position === active.currentPos;
                  const isAnswered = active.answeredPositions.includes(ic.position);
                  return (
                    <div
                      key={ic.position}
                      className="op-captcha__icon"
                      style={{
                        width: isCurrent ? 52 : 36,
                        height: isCurrent ? 52 : 36,
                        border: isCurrent ? "2px solid #58a6ff" : "1px solid #30363d",
                        opacity: isAnswered && !isCurrent ? 0.35 : isCurrent ? 1 : 0.55,
                        background: isAnswered ? "#1a3320" : "transparent",
                      }}
                    >
                      {ic.icon && (
                        <img
                          src={"data:image/png;base64," + ic.icon}
                          alt={`#${ic.position + 1}`}
                          className="op-captcha__icon-img"
                          draggable={false}
                        />
                      )}
                      {isAnswered && (
                        <div className="op-captcha__icon-check">✓</div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Точки-индикаторы */}
          <div className="op-captcha__dots">
            {Array.from({ length: 5 }, (_, i) => {
              if (iconDisplayMode === "own_only" && !active.assigned.includes(i)) return null;
              return (
                <div
                  key={i}
                  className="op-captcha__dot"
                  style={{
                    background: active.assigned.includes(i)
                      ? active.answeredPositions.includes(i)
                        ? "#3fb950"
                        : i === active.currentPos
                        ? "#58a6ff"
                        : "#6c757d"
                      : active.answeredPositions.includes(i)
                      ? "#2ea043"
                      : "#30363d",
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
