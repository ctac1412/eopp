import { trainingService } from "../api/trainingService";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Alert, Card, Progress, Spin } from "antd";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import PuzzleVariantTiles from "../../captcha/shared/PuzzleVariantTiles";
import { Button, MetricsStrip, StatusTag, Toolbar } from "../../../ui";

function randomInterval(min, max) {
  return Math.floor((min + Math.random() * (max - min)) * 1000);
}

export default function TrainingRunPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runId = parseInt(id);
  const pauseBetween = searchParams.get("pause") !== "0"; // default true (exam mode)

  const [status, setStatus] = useState(null);  // null=loading, {total_captchas, solved, ...}
  const [current, setCurrent] = useState(null);  // current captcha data
  const [waiting, setWaiting] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [feedback, setFeedback] = useState(null);  // {correct, duration_ms}
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  // Icon-click state
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [iconMarkers, setIconMarkers] = useState([]);  // [{x, y}] вЂ” original-image coords
  const [iconClickTimes, setIconClickTimes] = useState([]);  // [{icon_position, duration_ms}]
  const iconClickCountRef = useRef(0);
  const timerRef = useRef(null);
  const delayRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await trainingService.runStatus(runId);
      const data = await res.json();
      setStatus(data);
      return data;
    } catch (e) {
      setError("РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё СЃС‚Р°С‚СѓСЃР°");
      return null;
    }
  }, [runId]);

  const completeRun = async () => {
    try {
      await trainingService.complete(runId);
    } catch (e) {}
    loadStatus();
  };

  const loadNext = useCallback(async () => {
    try {
      const res = await trainingService.next(runId);
      const data = await res.json();
      if (data.done) {
        setDone(true);
        completeRun();
        return;
      }
      setCurrent(data);
      setSelectedVariant(null);
      setFeedback(null);
      setNaturalSize(null);
      setIconMarkers([]);
      setIconClickTimes([]);
      iconClickCountRef.current = 0;
      setStartTime(Date.now());
    } catch (e) {
      setError("РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РєР°РїС‡Рё");
    }
  }, [runId]);

  // Initial load
  useEffect(() => {
    loadStatus().then(data => {
      if (data && data.status === "running" && data.remaining > 0) {
        if (pauseBetween) {
          const delay = randomInterval(2, 7);
          setWaiting(true);
          delayRef.current = setTimeout(() => {
            setWaiting(false);
            loadNext();
          }, delay);
        } else {
          loadNext();
        }
      } else if (data && data.remaining === 0) {
        setDone(true);
        completeRun();
      }
    });
    return () => {
      clearTimeout(delayRef.current);
      clearTimeout(timerRef.current);
    };
  }, []);

  // Submit puzzle answer
  const submitPuzzle = async (variantIndex) => {
    if (selectedVariant !== null || feedback) return;
    const duration = startTime ? Date.now() - startTime : 0;
    setSelectedVariant(variantIndex);

    try {
      const res = await trainingService.answer(runId, {
        captcha_id: current.captcha_id,
        captcha_file_id: current.captcha_file_id,
        variant_index: variantIndex,
        duration_ms: duration,
      });
      const data = await res.json();
      setFeedback({
        correct: data.is_correct,
        duration_ms: duration,
        variant_index: variantIndex,
      });
    } catch (e) {
      setError("РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РѕС‚РІРµС‚Р°");
    }
  };

  // Icon click on image вЂ” matches real NormalIconClick behaviour
  const handleIconClick = (e) => {
    if (!current || feedback || !imgRef.current || !naturalSize) return;
    if (iconMarkers.length >= 5) return;

    const now = Date.now();
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = naturalSize.w / rect.width;
    const scaleY = naturalSize.h / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    const position = iconMarkers.length; // 0-based
    const iconDuration = position === 0
      ? (startTime ? now - startTime : 0)
      : now - (iconClickTimes[position - 1]?.timestamp || now);

    const newMarkers = [...iconMarkers, { x, y, label: position + 1 }];
    const newTimes = [...iconClickTimes, { icon_position: position, duration_ms: iconDuration, x, y, timestamp: now }];

    setIconMarkers(newMarkers);
    setIconClickTimes(newTimes);

    if (newMarkers.length >= 5) {
      const totalDuration = startTime ? now - startTime : 0;
      submitIconAnswer(
        newTimes.map(({ icon_position, duration_ms, x, y }) => ({ icon_position, duration_ms, x, y })),
        totalDuration,
      );
    }
  };

  const handleIconImageLoad = (e) => {
    setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  };

  async function submitIconAnswer(answers, totalDuration) {
    try {
      const res = await trainingService.answer(runId, {
        captcha_id: current.captcha_id,
        captcha_file_id: current.captcha_file_id,
        duration_ms: totalDuration,
        icon_times: answers,
      });
      const data = await res.json();
      setFeedback({
        correct: data.is_correct,
        duration_ms: totalDuration,
      });
    } catch (e) {
      setError("РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РѕС‚РІРµС‚Р°");
    }
  }

  // Move to next after feedback
  useEffect(() => {
    if (feedback && !done) {
      if (!pauseBetween) {
        // No delay вЂ” immediately check if more captchas
        setWaiting(true);
        loadStatus().then(st => {
          setWaiting(false);
          if (st && st.remaining > 0) {
            loadNext();
          } else {
            setDone(true);
            completeRun();
          }
        });
      } else {
        const delay = randomInterval(2, 7);
        setWaiting(true);
        delayRef.current = setTimeout(async () => {
          setWaiting(false);
          const st = await loadStatus();
          if (st && st.remaining > 0) {
            loadNext();
          } else {
            setDone(true);
            completeRun();
          }
        }, delay);
      }
    }
    return () => clearTimeout(delayRef.current);
  }, [feedback]);

  const formatMs = (ms) => {
    if (ms == null) return "вЂ”";
    return `${(ms / 1000).toFixed(2)}СЃ`;
  };

  // Puzzle captcha rendering
  const renderPuzzle = () => {
    if (!current || !current.variants) return null;
    const variantKeys = current.variants.map((_, index) => String(index));
    const cols = Math.min(variantKeys.length, 5);

    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {variantKeys.map(key => {
          const idx = parseInt(key);
          const isCorrectAnswer = feedback && feedback.variant_index === idx && feedback.correct;
          const isWrongAnswer = feedback && feedback.variant_index === idx && !feedback.correct;
          const isActualCorrect = feedback && current.valid_index === idx;

          let border = "1px solid var(--border)";
          if (isCorrectAnswer) border = "4px solid #28a745";
          else if (isWrongAnswer) border = "4px solid #dc3545";
          else if (isActualCorrect && feedback) border = "3px dashed #28a745";

          return (
            <div
              key={key}
              onClick={() => !feedback && submitPuzzle(idx)}
              style={{
                cursor: feedback ? "default" : "pointer",
                opacity: feedback && !isCorrectAnswer && !isActualCorrect ? 0.5 : 1,
                border,
                borderRadius: 8,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <PuzzleVariantTiles entry={current} index={idx} style={{ aspectRatio: "16 / 9" }} />
              <div style={{
                textAlign: "center",
                padding: "4px 0",
                fontSize: "0.75rem",
                background: "var(--surface-raised)",
                borderTop: "1px solid var(--border)",
              }}>
                #{idx}
                {isCorrectAnswer && <StatusTag status="confirmed" label="вњ“" />}
                {isWrongAnswer && <StatusTag status="failed" label="вњ—" />}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Icon click captcha rendering вЂ” like NormalIconClick
  const renderIconClick = () => {
    if (!current) return null;
    const mainImg = current.images?.["0"];
    const iconsImg = current.icons_image;
    const isIconClick = current.captcha_type === 1;

    if (!isIconClick) return null;

    const colors = ["#dc3545", "#fd7e14", "#ffc107", "#198754", "#0d6efd"];

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {/* Status */}
        <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-muted)" }}>
          РљР»РёРє-РєР°РїС‡Р° вЂ” РЅР°Р¶РјРёС‚Рµ РЅР° РёРєРѕРЅРєРё РІ РїСЂР°РІРёР»СЊРЅРѕРј РїРѕСЂСЏРґРєРµ ({iconMarkers.length}/5)
        </div>

        {/* Clickable main image */}
        <div style={{
          position: "relative",
          display: "inline-block",
          cursor: feedback || iconMarkers.length >= 5 ? "default" : "crosshair",
          maxWidth: "100%",
        }}>
          {mainImg && (
            <img
              ref={imgRef}
              src={"data:image/png;base64," + mainImg}
              alt="РљР°РїС‡Р°"
              onLoad={handleIconImageLoad}
              onClick={handleIconClick}
              style={{
                width: "100%",
                maxWidth: "800px",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: 8,
                border: "2px solid var(--border)",
                opacity: feedback ? 0.5 : 1,
                display: "block",
              }}
              draggable={false}
            />
          )}
          {/* Markers for clicks */}
          {naturalSize && iconMarkers.map((m, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${((m.x / naturalSize.w) * 100).toFixed(2)}%`,
                top: `${((m.y / naturalSize.h) * 100).toFixed(2)}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            >
              <div style={{
                width: 32, height: 32,
                borderRadius: "50%",
                background: colors[i % colors.length],
                border: "3px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 16,
                fontWeight: "bold",
                boxShadow: "0 0 12px rgba(0,0,0,0.6)",
              }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>

        {/* Icons strip */}
        {iconsImg && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.8rem", color: "#8b949e", marginBottom: 4 }}>
              РџРѕСЂСЏРґРѕРє РёРєРѕРЅРѕРє (РєР»РёРєР°Р№С‚Рµ СЃР»РµРІР° РЅР°РїСЂР°РІРѕ)
            </div>
            <img
              src={"data:image/png;base64," + iconsImg}
              alt="РРєРѕРЅРєРё"
              style={{ height: 50, borderRadius: 4, display: "block", margin: "0 auto" }}
              draggable={false}
            />
            <div style={{ display: "flex", justifyContent: "space-around", marginTop: 2, fontSize: "0.75rem", maxWidth: 250, margin: "2px auto 0" }}>
              {[1, 2, 3, 4, 5].map(n => (
                <span
                  key={n}
                  style={{
                    color: n - 1 < iconMarkers.length ? "#198754" : "#8b949e",
                    fontWeight: n - 1 < iconMarkers.length ? 700 : 400,
                    minWidth: 16,
                    textAlign: "center",
                  }}
                >
                  {n - 1 < iconMarkers.length ? "вњ“" : n}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Click time log */}
        {iconClickTimes.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {iconClickTimes.map((t, i) => (
              <StatusTag
                key={i}
                status="neutral"
                color="blue"
                label={`РРє.${t.icon_position + 1}: ${formatMs(t.duration_ms)}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div data-eopp-component="TrainingRunPage" className="training-run-page training-run-page--center">
        <Alert type="error" showIcon message={error} />
        <Button variant="primary" onClick={() => navigate("/training")}>
          РќР°Р·Р°Рґ Рє РѕР±СѓС‡РµРЅРёСЋ
        </Button>
      </div>
    );
  }

  if (!status) {
    return (
      <div data-eopp-component="TrainingRunPage" className="training-run-page training-run-page--center">
        <Spin />
      </div>
    );
  }

  if (done || status.status === "completed" || (status.remaining === 0 && status.solved > 0)) {
    const doneMetrics = status.stats ? [
      { key: "correct", label: "РџСЂР°РІРёР»СЊРЅРѕ", value: `${status.stats.correct}/${status.stats.total}`, tone: "success" },
      { key: "avg", label: "РЎСЂРµРґ. РІСЂРµРјСЏ", value: formatMs(status.stats.avg_duration_ms), tone: "neutral" },
      { key: "avgIcon", label: "РЎСЂРµРґ. РёРєРѕРЅРєР°", value: formatMs(status.stats.avg_icon_ms), tone: "neutral" },
      { key: "errors", label: "РћС€РёР±РѕРє", value: status.stats.incorrect, tone: "danger" },
    ] : [];
    return (
      <div data-eopp-component="TrainingRunPage" className="training-run-page">
        <Card
          data-eopp-component="TrainingRunDoneCard"
          size="small"
          title="РџСЂРѕРіРѕРЅ Р·Р°РІРµСЂС€С‘РЅ"
          extra={<StatusTag status="confirmed" label={`${status.solved}/${status.total_captchas}`} />}
        >
          <div className="training-run__done-text">Р РµС€РµРЅРѕ {status.solved}/{status.total_captchas} РєР°РїС‡</div>
        {status.stats && (
          <MetricsStrip items={doneMetrics} />
        )}
          <div className="training-run__done-actions">
            <Button variant="primary" onClick={() => navigate(`/training/run/${runId}/results`)}>
              РџРѕРґСЂРѕР±РЅС‹Рµ СЂРµР·СѓР»СЊС‚Р°С‚С‹
            </Button>
            <Button onClick={() => navigate("/training")}>
              Рљ РѕР±СѓС‡РµРЅРёСЋ
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div data-eopp-component="TrainingRunPage" className="training-run-page">
      <Toolbar
        className="training-run__toolbar"
        left={
          <div className="training-run__title">
            <strong>РџСЂРѕРіРѕРЅ #{runId}</strong>
            <span>РљР°РїС‡Р° {status.solved + 1}/{status.total_captchas}</span>
          </div>
        }
        right={
          <Button
          size="small"
          variant="danger"
          onClick={async () => {
            await trainingService.cancel(runId);
            navigate("/training");
          }}
        >
            РџСЂРµСЂРІР°С‚СЊ
          </Button>
        }
      />
      <Progress
        data-eopp-component="TrainingRunProgress"
        percent={Math.round((status.solved / status.total_captchas) * 100)}
        size="small"
        showInfo={false}
      />

      {waiting ? (
        <Card data-eopp-component="TrainingRunWaitingCard" size="small">
          <div className="training-run-page--center">
            <Spin />
            <span>РЎР»РµРґСѓСЋС‰Р°СЏ РєР°РїС‡Р° РїРѕСЏРІРёС‚СЃСЏ С‡РµСЂРµР· 2-7 СЃРµРєСѓРЅРґ...</span>
          </div>
        </Card>
      ) : current ? (
        <Card
          data-eopp-component="TrainingRunCaptchaCard"
          size="small"
          title={<span className="training-run__captcha-id">{current.captcha_id?.slice(0, 16)}...</span>}
          extra={<StatusTag status="neutral" label={current.captcha_type === 1 ? "РљР»РёРє-РєР°РїС‡Р°" : "РџР°Р·Р»"} />}
        >
            {current.captcha_type === 1 ? renderIconClick() : renderPuzzle()}

            {feedback && (
              <Alert
                data-eopp-component="TrainingRunFeedback"
                className="training-run__feedback"
                type={feedback.correct ? "success" : "error"}
                showIcon
                message={`${feedback.correct ? "РџСЂР°РІРёР»СЊРЅРѕ" : "РќРµРїСЂР°РІРёР»СЊРЅРѕ"} вЂ” ${formatMs(feedback.duration_ms)}`}
              />
            )}
        </Card>
      ) : null}
    </div>
  );
}
