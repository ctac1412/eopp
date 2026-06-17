import { trainingService } from "../api/trainingService";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Alert, Card, Spin } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { Button, StatusTag, Toolbar } from "../../../ui";

const COLORS = ["#dc3545", "#fd7e14", "#ffc107", "#198754", "#0d6efd"];

function formatMs(ms) {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(2)}с`;
}

// Approximate positions when x/y data is missing (old runs)
// Spread markers evenly along a vertical line at 80% width
function fallbackPosition(i, w, h) {
  const step = h / 6;
  return { x: w * 0.75, y: step * (i + 1) };
}

export default function TrainingReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const runId = parseInt(id);

  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [captchaData, setCaptchaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgSize, setImgSize] = useState(null);  // {w, h} of rendered image
  const imgContainerRef = useRef(null);

  useEffect(() => {
    trainingService.request(`/training/run/${runId}/results`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [runId]);

  useEffect(() => {
    if (!data?.results || idx >= data.results.length) return;
    const result = data.results[idx];
    if (!result) return;

    setImgLoading(true);
    setCaptchaData(null);
    setImgSize(null);

    trainingService.request(`/training/captcha/${encodeURIComponent(result.captcha_id)}`)
      .then(r => r.json())
      .then(d => { setCaptchaData(d); setImgLoading(false); })
      .catch(() => setImgLoading(false));
  }, [data, idx]);

  // Measure the rendered image container on mount & resize
  const measureContainer = useCallback(() => {
    if (imgContainerRef.current) {
      const rect = imgContainerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setImgSize({ w: rect.width, h: rect.height });
      }
    }
  }, []);

  useEffect(() => {
    if (!imgLoading && captchaData) {
      // Delay measurement to let the image render
      const t = setTimeout(measureContainer, 100);
      window.addEventListener("resize", measureContainer);
      return () => {
        clearTimeout(t);
        window.removeEventListener("resize", measureContainer);
      };
    }
  }, [imgLoading, captchaData, measureContainer]);

  if (loading) {
    return (
      <div data-eopp-component="TrainingReviewPage" className="training-review-page training-review-page--center">
        <Spin />
      </div>
    );
  }
  if (!data) {
    return (
      <div data-eopp-component="TrainingReviewPage" className="training-review-page">
        <Alert type="info" showIcon message="Нет данных" />
      </div>
    );
  }

  const results = data.results || [];
  if (results.length === 0) {
    return (
      <div data-eopp-component="TrainingReviewPage" className="training-review-page">
        <Alert type="info" showIcon message="Нет результатов" />
      </div>
    );
  }

  const current = results[idx];
  const total = results.length;

  const goPrev = () => setIdx(Math.max(0, idx - 1));
  const goNext = () => setIdx(Math.min(total - 1, idx + 1));

  const hasExactCoords = () => {
    const iconTimes = current.icon_times || [];
    return iconTimes.length > 0 && iconTimes.every(it => it.x != null && it.y != null);
  };

  // ── Icon-click review ──────────────────────────────────────────

  const renderIconReview = () => {
    const mainImg = captchaData?.images?.["0"];
    const iconsImg = captchaData?.icons_image;
    const iconTimes = current.icon_times || [];
    const exactCoords = hasExactCoords();
    const meta = captchaData?.meta;  // ground-truth boxes/coordinates from captcha file

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {/* Main image with markers */}
        <div
          ref={imgContainerRef}
          style={{ position: "relative", display: "inline-block", maxWidth: "100%", lineHeight: 0 }}
        >
          {mainImg && (
            <img
              src={"data:image/png;base64," + mainImg}
              alt="Капча"
              onLoad={measureContainer}
              style={{
                width: "100%", maxWidth: "800px", maxHeight: "70vh",
                objectFit: "contain", borderRadius: 8,
                border: "2px solid var(--border)", display: "block",
                opacity: current.status === "correct" ? 1 : 0.7,
              }}
              draggable={false}
            />
          )}
          {/* Ground-truth boxes (from labeling) */}
          {imgSize && meta?.coordinates && meta.coordinates.map((c, i) => (
            <div
              key={"gt-" + i}
              style={{
                position: "absolute",
                left: `${((c.x / imgSize.w) * 100).toFixed(2)}%`,
                top: `${((c.y / imgSize.h) * 100).toFixed(2)}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: "50%",
                border: "3px dashed rgba(40,167,69,0.8)",
                background: "rgba(40,167,69,0.10)",
              }} />
              <div style={{
                position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)",
                fontSize: "0.65rem", color: "#28a745", fontWeight: 600,
                background: "rgba(0,0,0,0.7)", padding: "0 4px", borderRadius: 3,
              }}>
                #{i + 1}
              </div>
            </div>
          ))}
          {/* Labeled boxes (from captcha file root) */}
          {imgSize && captchaData?.boxes && captchaData.boxes.map((b, i) => {
            if (!b || (b.w === 0 && b.h === 0)) return null;
            return (
              <div key={"box-" + i} style={{
                position: "absolute",
                left: `${((b.x / imgSize.w) * 100).toFixed(2)}%`,
                top: `${((b.y / imgSize.h) * 100).toFixed(2)}%`,
                width: `${((b.w / imgSize.w) * 100).toFixed(2)}%`,
                height: `${((b.h / imgSize.h) * 100).toFixed(2)}%`,
                pointerEvents: "none", zIndex: 0,
                border: `2px solid ${COLORS[i % COLORS.length]}`,
                background: COLORS[i % COLORS.length] + "18",
              }}>
                <div style={{
                  position: "absolute", top: -18, left: 4,
                  fontSize: "0.6rem", fontWeight: 700,
                  color: COLORS[i % COLORS.length],
                  background: "rgba(0,0,0,0.7)", padding: "0 3px", borderRadius: 3,
                }}>#{i + 1}</div>
              </div>
            );
          })}
          {/* Labeled points (from captcha file root, if no meta coords) */}
          {imgSize && !meta?.coordinates && captchaData?.coordinates && captchaData.coordinates.map((c, i) => (
            <div
              key={"lbl-" + i}
              style={{
                position: "absolute",
                left: `${((c.x / imgSize.w) * 100).toFixed(2)}%`,
                top: `${((c.y / imgSize.h) * 100).toFixed(2)}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none", zIndex: 1,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                border: `2px dashed ${COLORS[i % COLORS.length]}`,
                background: COLORS[i % COLORS.length] + "22",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: COLORS[i % COLORS.length], fontSize: 12, fontWeight: "bold",
              }}>{i + 1}</div>
            </div>
          ))}
          {/* Operator click markers */}
          {imgSize && iconTimes.map((it, i) => {
            const hasCoord = it.x != null && it.y != null;
            let leftPct, topPct;
            if (hasCoord) {
              // Assume stored x/y are in the ORIGINAL image coordinates.
              // We display on the rendered image — scale proportionally.
              // Since the image is shown at container width, we use imgSize.w
              leftPct = (it.x / imgSize.w) * 100;
              topPct = (it.y / imgSize.h) * 100;
            } else {
              const fb = fallbackPosition(i, imgSize.w, imgSize.h);
              leftPct = (fb.x / imgSize.w) * 100;
              topPct = (fb.y / imgSize.h) * 100;
            }

            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${leftPct.toFixed(2)}%`,
                  top: `${topPct.toFixed(2)}%`,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: COLORS[i % COLORS.length],
                  border: hasCoord ? "3px solid #fff" : "3px dashed #fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 15, fontWeight: "bold",
                  boxShadow: "0 0 12px rgba(0,0,0,0.6)",
                  opacity: hasCoord ? 1 : 0.6,
                }}>
                  {i + 1}
                </div>
              </div>
            );
          })}
        </div>

        {!exactCoords && iconTimes.length > 0 && (
          <small className="text-warning" style={{ fontSize: "0.75rem" }}>
            ⚠ Приблизительные позиции — старый прогон без координат кликов
          </small>
        )}

        {/* Icons strip */}
        {iconsImg && (
          <div style={{ textAlign: "center" }}>
            <img
              src={"data:image/png;base64," + iconsImg}
              alt="Иконки"
              style={{ height: 50, borderRadius: 4, display: "block", margin: "0 auto" }}
              draggable={false}
            />
          </div>
        )}

        {/* Timing per icon */}
        {iconTimes.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {iconTimes.map((it, i) => (
              <div key={i} style={{
                padding: "4px 10px", borderRadius: 6,
                background: COLORS[i % COLORS.length] + "22",
                border: `1px solid ${COLORS[i % COLORS.length]}`,
                fontSize: "0.8rem", fontWeight: 500,
              }}>
                <span style={{ color: COLORS[i % COLORS.length] }}>●</span> Ик.{i + 1}: {formatMs(it.duration_ms)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Puzzle review ──────────────────────────────────────────────

  const renderPuzzleReview = () => {
    if (!captchaData?.images) return null;
    const imgKeys = Object.keys(captchaData.images).sort((a, b) => parseInt(a) - parseInt(b));
    const cols = Math.min(imgKeys.length, 5);
    const chosen = current.variant_index;
    const correct = captchaData.valid_index;

    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {imgKeys.map(key => {
          const vi = parseInt(key);
          const isChosen = chosen != null && vi === chosen;
          const isCorrect = correct != null && vi === correct;
          let border = "1px solid var(--border)";
          if (isChosen && isCorrect) border = "4px solid #28a745";
          else if (isChosen && !isCorrect) border = "4px solid #dc3545";
          else if (isCorrect && !isChosen) border = "3px dashed #28a745";

          return (
            <div key={key} style={{
              border, borderRadius: 8, overflow: "hidden",
              opacity: (chosen != null && !isChosen && !isCorrect) ? 0.4 : 1,
            }}>
              <img
                src={"data:image/png;base64," + captchaData.images[key]}
                alt={`Вариант ${vi}`}
                style={{ width: "100%", display: "block" }}
              />
              <div style={{
                textAlign: "center", padding: "4px 0", fontSize: "0.75rem",
                background: "var(--surface-raised)", borderTop: "1px solid var(--border)",
              }}>
                #{vi}
                {isChosen && isCorrect && <StatusTag status="confirmed" label="Выбрано" />}
                {isChosen && !isCorrect && <StatusTag status="failed" label="Выбрано" />}
                {isCorrect && !isChosen && <StatusTag status="confirmed" label="Верно" />}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────

  const isIcon = captchaData?.captcha_type === 1;

  return (
    <div data-eopp-component="TrainingReviewPage" className="training-review-page">
      <Toolbar
        className="training-review__toolbar"
        left={
          <Button size="small" onClick={() => navigate(`/training/run/${runId}/results`)}>
            К результатам
          </Button>
        }
        right={
          <>
            <Button size="small" onClick={goPrev} disabled={idx === 0}>
              Пред.
            </Button>
            <Button size="small" onClick={goNext} disabled={idx >= total - 1}>
              След.
            </Button>
          </>
        }
      />

      <Card data-eopp-component="TrainingReviewNavCard" size="small">
        <div className="training-review__nav">
          <div className="training-review__title">
            <strong>Капча {idx + 1} из {total}</strong>
            <span>{current.captcha_id?.slice(0, 16)}...</span>
          </div>
          <div className="training-review__dots">
            {results.map((r, i) => (
              <Button
                key={i}
                htmlType="button"
                className={`training-review__dot ${i === idx ? "is-active" : ""} is-${r.status || "neutral"}`}
                onClick={() => setIdx(i)}
                title={`#${i + 1}: ${r.status}`}
              />
            ))}
          </div>
        </div>
      </Card>

      {imgLoading ? (
        <Card data-eopp-component="TrainingReviewImageCard" size="small">
          <div className="training-review-page--center"><Spin /></div>
        </Card>
      ) : captchaData ? (
        <Card
          data-eopp-component="TrainingReviewImageCard"
          size="small"
          title={isIcon ? "Клик-капча" : "Пазл"}
          extra={
            <div className="training-review__status">
              <StatusTag
                status={current.status === "correct" ? "confirmed" : current.status === "incorrect" ? "failed" : "warning"}
                label={current.status === "correct" ? "Правильно" : current.status === "incorrect" ? "Ошибка" : current.status}
              />
              <span>{formatMs(current.duration_ms)}</span>
            </div>
          }
        >
          {isIcon ? renderIconReview() : renderPuzzleReview()}
        </Card>
      ) : (
        <Alert type="error" showIcon message="Не удалось загрузить капчу" />
      )}
    </div>
  );
}
