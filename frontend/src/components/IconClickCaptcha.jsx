import React, { useState, useRef, useEffect } from "react";
import useCaptchaStore from "../store/useCaptchaStore";

function IconClickCaptcha({ entry }) {
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);
  const [markers, setMarkers] = useState([]);
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);

  const mainImage = entry.images?.["0"] || "";
  const iconsImage = entry.iconsImage || "";

  const handleImageLoad = (e) => {
    setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  };

  const handleClick = (e) => {
    if (entry.solved || markers.length >= 5) return;

    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = naturalSize.w / rect.width;
    const scaleY = naturalSize.h / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    const newMarkers = [...markers, { x, y }];
    setMarkers(newMarkers);

    if (newMarkers.length >= 5) {
      submitAnswer(newMarkers);
    }
  };

  const submitAnswer = async (coords) => {
    const res = await fetch("/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captcha_id: entry.id,
        variantIndex: 0,
        coordinates: coords,
        api_key: apiKey,
      }),
    });
    const data = await res.json();

    if (data.already_solved) {
      useCaptchaStore.getState().markSolved(entry.id);
      useCaptchaStore.getState().addLog(`Капча ${entry.id} уже решена другим киоском`, "info");
      return;
    }

    useCaptchaStore.getState().markSolved(entry.id, superKioskMode, null);
    const solverInfo = superKioskMode && entry.ownerLabel
      ? `Супер Киоск → ${entry.ownerLabel}`
      : superKioskMode ? "Супер Киоск" : "Локально";
    useCaptchaStore.getState().addLog(
      `Решено [${solverInfo}]: ${entry.id} → ${JSON.stringify(coords)} (${data.resultFile})`,
      "success",
    );
  };

  const resetMarkers = () => setMarkers([]);

  return (
    <div className="card" style={{ animation: "fade-in 0.3s ease", height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="fw-semibold" style={{ fontSize: "0.9rem" }}>
            Капча {entry.id}
          </span>
          <span className="badge" style={{ background: "#6f42c1", fontSize: "0.7rem" }}>
            клик-капча
          </span>
          {superKioskMode && entry.ownerLabel && (
            <span className="badge bg-info" style={{ fontSize: "0.7rem" }}>
              для: {entry.ownerLabel}
            </span>
          )}
        </div>
        <div className="d-flex align-items-center gap-3">
          {!entry.solved && (
            <span style={{ fontSize: "0.85rem", fontWeight: "500" }}>
              {markers.length === 0
                ? "Кликните на картинку для точки 1"
                : markers.length < 5
                ? `Следующая: точка ${markers.length + 1} из 5`
                : "Отправка..."}
            </span>
          )}
          {entry.solved && (
            <span className="badge bg-success" style={{ fontSize: "0.8rem" }}>Решено</span>
          )}
          {markers.length > 0 && !entry.solved && (
            <button className="btn btn-sm btn-outline-secondary" onClick={resetMarkers}
              style={{ fontSize: "0.75rem", padding: "3px 10px" }}>
              Сбросить ({markers.length}/5)
            </button>
          )}
        </div>
      </div>

      <div className="card-body d-flex flex-column align-items-center justify-content-center flex-grow-1" style={{ gap: "12px", minHeight: 0 }}>
        <div style={{ position: "relative", display: "inline-block", cursor: entry.solved ? "default" : "crosshair", maxWidth: "100%" }}>
          {mainImage && (
            <img
              ref={imgRef}
              src={"data:image/png;base64," + mainImage}
              alt="Капча"
              onLoad={handleImageLoad}
              onClick={handleClick}
              style={{
                width: "100%",
                maxWidth: "800px",
                maxHeight: "75vh",
                objectFit: "contain",
                borderRadius: "8px",
                border: "2px solid var(--border)",
                opacity: entry.solved ? 0.5 : 1,
                display: "block",
              }}
              draggable={false}
            />
          )}
          {naturalSize && markers.map((m, i) => {
            const colors = [
              "#dc3545", "#fd7e14", "#ffc107", "#198754", "#0d6efd",
            ];
            return (
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
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: colors[i],
                border: "3px solid #fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "16px",
                fontWeight: "bold",
                boxShadow: "0 0 12px rgba(0,0,0,0.6)",
              }}>
                {i + 1}
              </div>
            </div>
            );
          })}
        </div>

        {iconsImage && (
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: "0.8rem",
              fontWeight: "500",
              color: "#c9d1d9",
              marginBottom: "6px",
            }}>
              Порядок иконок (кликайте слева направо)
            </div>
            <img
              src={"data:image/png;base64," + iconsImage}
              alt="Иконки"
              style={{
                height: "50px",
                borderRadius: "4px",
              }}
              draggable={false}
            />
            <div style={{
              display: "flex",
              justifyContent: "space-around",
              marginTop: "2px",
              fontSize: "0.75rem",
              color: "#8b949e",
            }}>
              <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IconClickCaptcha;
