import React, { useState, useRef, useEffect, useMemo } from "react";
import useCaptchaStore from "../store/useCaptchaStore";

function isSequentialEnabled() {
  try {
    return localStorage.getItem("click_sequential_icons") === "1";
  } catch {
    return false;
  }
}

function IconClickCaptcha({ entry }) {
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const superKioskMode = useCaptchaStore((s) => s.superKioskMode);
  const isDistributed = !!entry.distribution;

  if (isDistributed) {
    return <DistributedIconClick entry={entry} apiKey={apiKey} superKioskMode={superKioskMode} />;
  }

  return <NormalIconClick entry={entry} apiKey={apiKey} superKioskMode={superKioskMode} />;
}

function NormalIconClick({ entry, apiKey, superKioskMode }) {
  const [markers, setMarkers] = useState([]);
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [sequential, setSequential] = useState(() => isSequentialEnabled());

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
      <Header entry={entry} superKioskMode={superKioskMode} status={entry.solved ? "Решено" : `${markers.length}/5`} markersCount={markers.length} onReset={resetMarkers} />
      <div className="card-body d-flex flex-column align-items-center justify-content-center flex-grow-1" style={{ gap: "12px", minHeight: 0 }}>
        <ClickArea
          image={mainImage}
          markers={markers}
          naturalSize={naturalSize}
          solved={entry.solved}
          imgRef={imgRef}
          onLoad={handleImageLoad}
          onClick={handleClick}
        />
        {iconsImage && (
          <IconsStrip iconsImage={iconsImage} currentPosition={sequential ? markers.length : -1} />
        )}
      </div>
    </div>
  );
}

function DistributedIconClick({ entry, apiKey, superKioskMode }) {
  const operatorId = entry.distribution?.operator_id ?? 0;
  const assigned = entry.distribution?.assigned ?? [0, 1, 2, 3, 4];
  const numOperators = entry.distribution?.num_operators ?? 1;
  const [currentImage, setCurrentImage] = useState(entry.images?.["0"] || "");
  const [currentIcon, setCurrentIcon] = useState(entry.iconsImage || "");
  const [currentPosition, setCurrentPosition] = useState(assigned[0] ?? null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [answeredPositions, setAnsweredPositions] = useState([]);
  const [allIcons, setAllIcons] = useState(entry.allIcons || []);
  const [markers, setMarkers] = useState([]);
  const [complete, setComplete] = useState(false);
  const [answering, setAnswering] = useState(false);
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);

  const liveAnswered = entry._distAnsweredPositions || answeredPositions;

  const foreignMarkers = useMemo(() => {
    const coords = entry._distAllCoords;
    if (!coords) return [];
    return Object.keys(coords)
      .filter((pos) => coords[pos].operator_id !== operatorId)
      .map((pos) => ({
        x: coords[pos].x,
        y: coords[pos].y,
        label: parseInt(pos) + 1,
      }));
  }, [entry._distAllCoords, operatorId]);

  const allMarkers = [...markers, ...foreignMarkers];

  const connectedOps = entry.distribution?.connected_operators || 0;
  const role = operatorId === 0
    ? (connectedOps > 0 ? `Мастер (+${connectedOps})` : "Мастер")
    : `Оператор #${operatorId}`;

  const handleClick = async (e) => {
    if (entry.solved || complete || answering) return;

    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = naturalSize.w / rect.width;
    const scaleY = naturalSize.h / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    setAnswering(true);
    try {
      const res = await fetch("/distribution/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captcha_id: entry.id,
          operator_id: operatorId,
          icon_position: currentPosition,
          x,
          y,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const nextPos = data.next_available ?? data.next_assigned;
        if ((res.status === 409 || res.status === 403) && nextPos != null) {
          setCurrentPosition(nextPos);
          if (data.answered_positions) setAnsweredPositions(data.answered_positions);
        } else if ((res.status === 409 || res.status === 403) && nextPos == null) {
          setComplete(true);
        }
        return;
      }

      if (data.complete) {
        setComplete(true);
        useCaptchaStore.getState().markSolved(entry.id);
        useCaptchaStore.getState().addLog(
          `${role}: капча ${entry.id} решена (distributed ${numOperators}op)`,
          "success",
        );
        return;
      }

      setMarkers((prev) => [...prev, { x, y, label: (currentPosition ?? 0) + 1 }]);
      setCurrentImage(data.image || "");
      setCurrentIcon(data.icon || "");
      setCurrentPosition(data.icon_position);
      setSolvedCount(data.solved_count);
      if (data.answered_positions) setAnsweredPositions(data.answered_positions);
      if (data.all_icons) setAllIcons(data.all_icons);
    } catch (err) {
      console.error("Distribution answer failed:", err);
    } finally {
      setAnswering(false);
    }
  };

  const handleImageLoad = (e) => {
    setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  };

  if (complete || entry.solved) {
    return (
      <div className="card" style={{ animation: "fade-in 0.3s ease", height: "100%", display: "flex", flexDirection: "column" }}>
        <Header entry={entry} superKioskMode={superKioskMode} status="Решено" role={role} />
        <div className="card-body d-flex align-items-center justify-content-center flex-grow-1">
          <span className="badge bg-success" style={{ fontSize: "1.2rem", padding: "12px 24px" }}>
            Решено (distributed {numOperators}op)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ animation: "fade-in 0.3s ease", height: "100%", display: "flex", flexDirection: "column" }}>
      <Header entry={entry} superKioskMode={superKioskMode} status={`${solvedCount}/5 решено`} role={role} />
      <div className="card-body d-flex flex-column align-items-center justify-content-center flex-grow-1" style={{ gap: "12px", minHeight: 0 }}>
        {currentImage && (
          <ClickArea
            image={currentImage}
            markers={allMarkers}
            naturalSize={naturalSize}
            solved={answering}
            imgRef={imgRef}
            onLoad={handleImageLoad}
            onClick={handleClick}
          />
        )}
        {allIcons.length > 0 && (
          <div style={{
            display: "flex", gap: 6, justifyContent: "center", alignItems: "center",
            marginTop: 4, padding: "8px 6px",
            background: "#0d1117", borderRadius: 8, border: "1px solid #21262d",
          }}>
            {allIcons.map((ic) => {
              const isCurrent = ic.position === currentPosition;
              const isAnswered = (entry._distAnsweredPositions || answeredPositions).includes(ic.position);
              return (
                <div
                  key={ic.position}
                  style={{
                    position: "relative",
                    width: isCurrent ? 52 : 36,
                    height: isCurrent ? 52 : 36,
                    borderRadius: 6,
                    border: isCurrent ? "2px solid #58a6ff" : "1px solid #30363d",
                    opacity: isAnswered && !isCurrent ? 0.35 : isCurrent ? 1 : 0.55,
                    background: isAnswered ? "#1a3320" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.2s",
                  }}
                >
                  {ic.icon && (
                    <img
                      src={"data:image/png;base64," + ic.icon}
                      alt={`#${ic.position + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 4 }}
                      draggable={false}
                    />
                  )}
                  {isAnswered && (
                    <div style={{
                      position: "absolute", top: -6, right: -6,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "#3fb950", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: "#fff", fontWeight: "bold",
                      border: "1.5px solid #0d1117",
                    }}>✓</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!allIcons.length && currentIcon && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.75rem", color: "#8b949e", marginBottom: 4 }}>
              Иконка #{currentPosition != null ? currentPosition + 1 : "?"}
            </div>
            <img
              src={"data:image/png;base64," + currentIcon}
              alt={`Иконка ${currentPosition != null ? currentPosition + 1 : ""}`}
              style={{ height: "50px", borderRadius: "4px" }}
              draggable={false}
            />
          </div>
        )}
        <div style={{ fontSize: "0.85rem", fontWeight: "500", color: "#c9d1d9" }}>
          {answering
            ? "Отправка..."
            : `Кликните на иконку #${currentPosition != null ? currentPosition + 1 : "?"} (${role})`}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: liveAnswered.includes(i)
                  ? "#198754"
                  : assigned.includes(i)
                    ? i === currentPosition ? "#0d6efd" : "#6c757d"
                    : "#343a40",
              }}
              title={assigned.includes(i) ? `${role}: ик${i + 1}` : `Аутсорс: ик${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Header({ entry, superKioskMode, status, role, markersCount, onReset }) {
  return (
    <div className="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div className="d-flex align-items-center gap-2">
        <span className="fw-semibold" style={{ fontSize: "0.9rem" }}>
          Капча {entry.id}
        </span>
        <span className="badge" style={{ background: "#6f42c1", fontSize: "0.7rem" }}>
          клик-капча
        </span>
        {role && (
          <span className="badge" style={{ background: "#17a2b8", fontSize: "0.7rem" }}>
            {role}
          </span>
        )}
        {superKioskMode && entry.ownerLabel && (
          <span className="badge bg-info" style={{ fontSize: "0.7rem" }}>
            для: {entry.ownerLabel}
          </span>
        )}
      </div>
      <div className="d-flex align-items-center gap-2">
        {markersCount > 0 && status !== "Решено" && (
          <button className="btn btn-sm btn-outline-secondary" onClick={onReset}
            style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
            Сбросить
          </button>
        )}
        <span className="badge" style={{
          background: status === "Решено" ? "#198754" : "#495057",
          fontSize: "0.8rem",
        }}>
          {status}
        </span>
      </div>
    </div>
  );
}

function ClickArea({ image, markers, naturalSize, solved, imgRef, onLoad, onClick }) {
  return (
    <div style={{
      position: "relative",
      display: "inline-block",
      cursor: solved ? "default" : "crosshair",
      maxWidth: "100%",
    }}>
      {image && (
        <img
          ref={imgRef}
          src={"data:image/png;base64," + image}
          alt="Капча"
          onLoad={onLoad}
          onClick={onClick}
          style={{
            width: "100%",
            maxWidth: "800px",
            maxHeight: "75vh",
            objectFit: "contain",
            borderRadius: "8px",
            border: "2px solid var(--border)",
            opacity: solved ? 0.5 : 1,
            display: "block",
          }}
          draggable={false}
        />
      )}
      {naturalSize && markers.map((m, i) => {
        const colors = ["#dc3545", "#fd7e14", "#ffc107", "#198754", "#0d6efd"];
        const label = m.label != null ? m.label : i + 1;
        const colorIdx = (m.label != null ? m.label - 1 : i) % colors.length;
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
              background: colors[colorIdx],
              border: "3px solid #fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "16px",
              fontWeight: "bold",
              boxShadow: "0 0 12px rgba(0,0,0,0.6)",
            }}>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IconsStrip({ iconsImage, currentPosition }) {
  const sequential = currentPosition >= 0;
  return (
    <div style={{ textAlign: "center", position: "relative", display: "inline-block" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: "500", color: "#c9d1d9", marginBottom: "6px" }}>
        {sequential
          ? `Иконка ${currentPosition + 1} из 5 — кликните на картинке`
          : "Порядок иконок (кликайте слева направо)"}
      </div>
      <div style={{ position: "relative", display: "inline-block" }}>
        <img
          src={"data:image/png;base64," + iconsImage}
          alt="Иконки"
          style={{ height: "50px", borderRadius: "4px", display: "block" }}
          draggable={false}
        />
        {sequential && (
          <div
            style={{
              position: "absolute",
              left: `${(currentPosition / 5) * 100}%`,
              top: 0,
              width: `${100 / 5}%`,
              height: "100%",
              border: "2px solid var(--accent)",
              borderRadius: "4px 4px 0 0",
              background: "rgba(124, 58, 237, 0.15)",
              boxSizing: "border-box",
              pointerEvents: "none",
              transition: "left 0.15s ease",
            }}
          />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: "2px", fontSize: "0.75rem" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            style={{
              color: sequential
                ? n - 1 === currentPosition
                  ? "var(--accent-light)"
                  : n - 1 < currentPosition
                    ? "#198754"
                    : "#484f58"
                : "#8b949e",
              fontWeight: sequential && (n - 1 === currentPosition || n - 1 < currentPosition) ? 700 : 400,
              minWidth: "16px",
              textAlign: "center",
            }}
          >
            {sequential && n - 1 < currentPosition ? "✓" : n}
          </span>
        ))}
      </div>
    </div>
  );
}

export default IconClickCaptcha;
