import { captchaService } from "./api/captchaService";
import React, { useEffect, useMemo, useState } from "react";
import useCaptchaStore from "../../../store/useCaptchaStore";
import { StatusTag } from "../../../ui";
import {
  CaptchaClickSurface,
  CaptchaIconStrip,
  CaptchaProgressDots,
} from "./CaptchaClickSurface";
import { CaptchaPanelHeader } from "./CaptchaPanelHeader";

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
    return (
      <DistributedIconClick
        entry={entry}
        apiKey={apiKey}
        superKioskMode={superKioskMode}
      />
    );
  }

  return (
    <NormalIconClick
      entry={entry}
      apiKey={apiKey}
      superKioskMode={superKioskMode}
    />
  );
}

function NormalIconClick({ entry, apiKey, superKioskMode }) {
  const [markers, setMarkers] = useState([]);
  const [sequential] = useState(() => isSequentialEnabled());

  const mainImage = entry.images?.["0"] || "";
  const iconsImage = entry.iconsImage || "";

  const submitAnswer = async (coords) => {
    const res = await captchaService.request("/solve", {
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
      useCaptchaStore.getState().addLog(
        `Капча ${entry.id} уже решена другим киоском`,
        "info",
      );
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

  const handleClick = (coords) => {
    if (entry.solved || markers.length >= 5) return;

    const newMarkers = [...markers, coords];
    setMarkers(newMarkers);

    if (newMarkers.length >= 5) {
      submitAnswer(newMarkers);
    }
  };

  return (
    <div className="captcha-panel">
      <CaptchaPanelHeader
        title={`Капча ${entry.id}`}
        statusLabel={entry.solved ? "Решено" : `${markers.length}/5`}
        statusStatus={entry.solved ? "confirmed" : "neutral"}
        createdAt={entry.createdAt}
        timeout={entry.timeout}
      />
      <div className="captcha-panel__body captcha-panel__body--column">
        <CaptchaClickSurface
          image={mainImage}
          markers={markers}
          disabled={entry.solved}
          className="captcha-click-area"
          imageClassName="captcha-click-area__image"
          onCoordinateClick={handleClick}
        />
        {iconsImage && (
          <IconsStrip
            iconsImage={iconsImage}
            currentPosition={sequential ? markers.length : -1}
          />
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

  const liveAnswered = entry._distAnsweredPositions || answeredPositions;

  const foreignMarkers = useMemo(() => {
    const coords = entry._distAllCoords;
    if (!coords) return [];
    return Object.keys(coords)
      .filter((pos) => coords[pos].operator_id !== operatorId)
      .map((pos) => ({
        x: coords[pos].x,
        y: coords[pos].y,
        label: parseInt(pos, 10) + 1,
      }));
  }, [entry._distAllCoords, operatorId]);

  const allMarkers = [...markers, ...foreignMarkers];

  const connectedOps = entry.distribution?.connected_operators || 0;
  const role = operatorId === 0
    ? (connectedOps > 0 ? `Мастер (+${connectedOps})` : "Мастер")
    : `Оператор #${operatorId}`;

  const handleClick = async ({ x, y }) => {
    if (entry.solved || complete || answering) return;

    setAnswering(true);
    try {
      const res = await captchaService.request("/distribution/answer", {
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

  if (complete || entry.solved) {
    return (
      <div className="captcha-panel">
        <CaptchaPanelHeader
          title={`Капча ${entry.id}`}
          statusLabel="Решено"
          statusStatus="confirmed"
        />
        <div className="captcha-panel__body">
          <StatusTag
            status="confirmed"
            label={`Решено (distributed ${numOperators}op)`}
            style={{ fontSize: "1rem", padding: "8px 16px", marginInlineEnd: 0 }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="captcha-panel">
      <CaptchaPanelHeader
        title={`Капча ${entry.id}`}
        statusLabel={`${solvedCount}/5 решено`}
        createdAt={entry.createdAt}
        timeout={entry.timeout}
      />
      <div className="captcha-panel__body captcha-panel__body--column">
        {currentImage && (
          <CaptchaClickSurface
            image={currentImage}
            markers={allMarkers}
            disabled={answering}
            className="captcha-click-area"
            imageClassName="captcha-click-area__image"
            onCoordinateClick={handleClick}
          />
        )}
        <CaptchaIconStrip
          icons={allIcons}
          assigned={assigned}
          currentPosition={currentPosition}
          answeredPositions={liveAnswered}
        />
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
        <CaptchaProgressDots
          assigned={assigned}
          answeredPositions={liveAnswered}
          currentPosition={currentPosition}
        />
      </div>
    </div>
  );
}

function IconsStrip({ iconsImage, currentPosition }) {
  const sequential = currentPosition >= 0;
  return (
    <div style={{ textAlign: "center", position: "relative", display: "inline-block" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: "500", color: "#c9d1d9", marginBottom: "6px" }}>
        {sequential
          ? `Иконка ${currentPosition + 1} из 5 - кликните на картинке`
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
