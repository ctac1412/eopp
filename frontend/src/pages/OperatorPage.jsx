import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";

const STORAGE_KEY = "operator_master";

function loadSavedMaster(uuid) {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return stored[uuid] || null;
  } catch {
    return null;
  }
}

function saveMaster(uuid, id, label) {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (id) stored[uuid] = { id, label }; else delete stored[uuid];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch { /* noop */ }
}

export function OperatorPage() {
  const { uuid } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [masters, setMasters] = useState([]);
  const [masterId, setMasterId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [masterOnline, setMasterOnline] = useState(false);
  const [captchaId, setCaptchaId] = useState("");
  const [operatorId, setOperatorId] = useState(0);
  const [currentPos, setCurrentPos] = useState(null);
  const [assigned, setAssigned] = useState([]);
  const [mainImage, setMainImage] = useState("");
  const [iconImage, setIconImage] = useState("");
  const [solvedCount, setSolvedCount] = useState(0);
  const [complete, setComplete] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [answeredPositions, setAnsweredPositions] = useState([]);
  const [allIcons, setAllIcons] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [foreignMarkers, setForeignMarkers] = useState([]);
  const [answering, setAnswering] = useState(false);
  const [log, setLog] = useState([]);
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const esRef = useRef(null);
  const captchaIdRef = useRef("");
  const assignedRef = useRef([]);
  const operatorIdRef = useRef(0);
  const masterIdRef = useRef(null);

  const addLog = (msg, cls) => {
    setLog((prev) => [{ time: new Date().toLocaleTimeString(), msg, cls: cls || "info" }, ...prev.slice(0, 49)]);
  };

  const disconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setConnected(false);
    setMasterOnline(false);
    setCaptchaId("");
    captchaIdRef.current = "";
    setMainImage("");
    setIconImage("");
    setWaiting(false);
    setMarkers([]);
    setForeignMarkers([]);
    setAnsweredPositions([]);
    setAllIcons([]);
  }, []);

  const clearCaptcha = useCallback(() => {
    setMainImage("");
    setIconImage("");
    setComplete(false);
    setWaiting(true);
    setMarkers([]);
    setForeignMarkers([]);
    setAnsweredPositions([]);
    setAllIcons([]);
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  useEffect(() => {
    masterIdRef.current = masterId;
  }, [masterId]);

  const connectViaId = useCallback(async (mid) => {
    if (!mid) return;
    disconnect();
    setConnecting(true);
    addLog("Подключение к SSE...", "info");
    try {
      await fetch(`/operators/${uuid}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master_id: mid }),
      });
    } catch (e) {
      addLog("Ошибка связи с сервером", "error");
      setConnecting(false);
      return;
    }

    const es = new EventSource(`/operators/${uuid}/stream`);
    esRef.current = es;
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "connected") {
        addLog(`Подключён (оператор #${msg.operator_id})`, "success");
        setConnected(true);
        setConnecting(false);
        const online = msg.masters_online || [];
        setMasterOnline(online.includes(masterIdRef.current));
        return;
      }
      if (msg.type === "master_online") {
        if (msg.master_key_id === masterIdRef.current) {
          setMasterOnline(true);
          addLog(`Мастер «${msg.master_label}» онлайн`, "success");
        }
        return;
      }
      if (msg.type === "master_offline") {
        if (msg.master_key_id === masterIdRef.current) {
          setMasterOnline(false);
          addLog(`Мастер «${msg.master_label}» офлайн`, "error");
        }
        return;
      }
      if (msg.type === "disconnected") {
        addLog("Переподключение...", "error");
        es.close();
        return;
      }
      if (msg.type === "new_captcha" && msg.distribution && msg.distribution.operator_id > 0) {
        setCaptchaId(msg.captcha_id);
        captchaIdRef.current = msg.captcha_id;
        setOperatorId(msg.distribution.operator_id);
        operatorIdRef.current = msg.distribution.operator_id;
        setAssigned(msg.distribution.assigned);
        assignedRef.current = msg.distribution.assigned;
        setMainImage(msg.images?.["0"] || "");
        setIconImage(msg.icons_image || "");
        setSolvedCount(0);
        setComplete(false);
        setWaiting(false);
        setMarkers([]);
        setForeignMarkers([]);
        setAnsweredPositions([]);
        setAllIcons(msg.all_icons || []);
        setCurrentPos(msg.distribution.assigned[0]);
        addLog(`Капча, ваши иконки: ${msg.distribution.assigned.map((i) => i + 1).join(", ")}`);
      }
      if (msg.type === "captcha_solved" && msg.captcha_id === captchaIdRef.current) {
        setComplete(true);
        setCaptchaId("");
        captchaIdRef.current = "";
        setWaiting(false);
        setMainImage("");
        setIconImage("");
        setMarkers([]);
        setForeignMarkers([]);
        addLog("Капча решена!", "success");
      }
      if (msg.type === "distribution_progress" && msg.captcha_id === captchaIdRef.current) {
        if (msg.answered_positions) {
          setAnsweredPositions(msg.answered_positions);
          const own = msg.answered_positions.filter((p) => assignedRef.current.includes(p)).length;
          setSolvedCount(own);
        }
        if (msg.all_coords) {
          const foreign = [];
          Object.keys(msg.all_coords).forEach((pos) => {
            const c = msg.all_coords[pos];
            if (c.operator_id !== operatorIdRef.current) {
              foreign.push({ x: c.x, y: c.y, label: parseInt(pos) + 1 });
            }
          });
          setForeignMarkers(foreign);
        }
      }
    };
    es.onopen = () => {
      addLog("SSE соединение установлено", "info");
    };
    es.onerror = () => addLog("SSE ошибка", "error");
  }, [uuid, disconnect, addLog, clearCaptcha]);

  useEffect(() => {
    fetch(`/operators/${uuid}/masters`)
      .then((r) => r.json())
      .then((list) => {
        const active = list.filter((k) => k.active);
        setMasters(active);

        const labelFromUrl = searchParams.get("master") || "";
        const saved = loadSavedMaster(uuid);
        let found = null;
        if (labelFromUrl) {
          found = active.find((m) => m.label === labelFromUrl);
        }
        if (!found && saved) {
          found = active.find((m) => m.id === saved.id);
        }
        if (found) {
          setMasterId(found.id);
          saveMaster(uuid, found.id, found.label);
          if (found.label) {
            setSearchParams({ master: found.label }, { replace: true });
          }
        }
      });
  }, [uuid]);

  useEffect(() => {
    if (masterId && masters.length > 0 && !connected && !connecting) {
      connectViaId(masterId);
    }
  }, [masterId, masters.length, connected, connecting, connectViaId]);

  const handleMasterChange = (idVal) => {
    const mid = idVal ? Number(idVal) : null;
    setMasterId(mid);
    const found = masters.find((m) => m.id === mid);
    const label = found ? found.label : "";
    saveMaster(uuid, mid, label);
    if (label) {
      setSearchParams({ master: label });
    } else {
      setSearchParams({});
    }
    if (mid && connected) {
      connectViaId(mid);
    }
  };

  const handleReconnect = () => {
    disconnect();
    if (masterId) connectViaId(masterId);
  };

  const handleClick = async (e) => {
    if (complete || waiting || !captchaId || !naturalSize || answering) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * naturalSize.w / rect.width);
    const y = Math.round((e.clientY - rect.top) * naturalSize.h / rect.height);

    setAnswering(true);
    try {
      const r = await fetch("/distribution/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captcha_id: captchaId, operator_id: operatorId, icon_position: currentPos ?? assigned[0], x, y }),
      });
      const data = await r.json();

      if (data.coordinates) {
        setComplete(true);
        addLog("Капча решена!", "success");
        return;
      }
      if (data.waiting) {
        clearCaptcha();
        addLog("Ваши иконки пройдены, ожидание...", "info");
        return;
      }
      if (data.image) setMainImage(data.image);
      if (data.icon) setIconImage(data.icon);
      if (data.all_icons) setAllIcons(data.all_icons);
      setCurrentPos(data.icon_position);
      setSolvedCount(data.solved_count);
      if (data.answered_positions) setAnsweredPositions(data.answered_positions);
      setMarkers((prev) => [...prev, { x, y, label: (currentPos ?? 0) + 1 }]);
      addLog(`Иконка #${(data.icon_position ?? 0) + 1} (${data.solved_count}/${assigned.length})`);
    } finally {
      setAnswering(false);
    }
  };

  const selectedMaster = masters.find((m) => m.id === masterId);

  return (
    <div className="container py-3" style={{ maxWidth: "700px" }}>
      {!connected ? (
        <div className="card p-4" style={{ background: "#161b22", border: "1px solid #30363d" }}>
          <h5 style={{ color: "#f0f6fc", marginBottom: 16 }}>Оператор распределённого решения</h5>
          <label style={{ fontSize: 13, color: "#8b949e", marginBottom: 4 }}>Помогать мастеру</label>
          <select className="form-select mb-3" value={masterId || ""} onChange={(e) => handleMasterChange(e.target.value)}
            style={{ background: "#0d1117", color: "#c9d1d9", border: "1px solid #30363d" }}>
            <option value="">Выберите мастера</option>
            {masters.map((m) => (
              <option key={m.id} value={m.id}>{m.label || `Мастер #${m.id}`}</option>
            ))}
          </select>
          <button className="btn btn-success w-100" onClick={() => connectViaId(masterId)} disabled={!masterId || connecting}>
            {connecting ? "Подключение..." : "Подключиться"}
          </button>
        </div>
      ) : (
        <div className="card" style={{ background: "#161b22", border: "1px solid #30363d" }}>
          <div className="d-flex justify-content-between align-items-center p-3 border-bottom" style={{ borderColor: "#30363d" }}>
            <div className="d-flex align-items-center gap-2">
              <span
                style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: masterOnline ? "#3fb950" : "#f85149",
                  boxShadow: masterOnline ? "0 0 6px #3fb950" : "0 0 6px #f85149",
                }}
                title={masterOnline ? "Мастер онлайн" : "Мастер офлайн"}
              />
              <span className="fw-semibold" style={{ color: "#f0f6fc" }}>
                {captchaId ? `Капча ${captchaId.slice(0, 8)}` : complete ? "Решено" : `Ожидание капчи (мастер ${masterOnline ? "онлайн" : "офлайн"})`}
              </span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <select
                className="form-select form-select-sm"
                value={masterId || ""}
                onChange={(e) => handleMasterChange(e.target.value)}
                style={{
                  background: "#0d1117", color: "#c9d1d9", border: "1px solid #30363d",
                  fontSize: "0.75rem", width: "auto", minWidth: "140px",
                }}
              >
                <option value="">Выберите мастера</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>{m.label || `Мастер #${m.id}`}</option>
                ))}
              </select>
              <span className="badge" style={{ background: complete ? "#198754" : waiting ? "#f59e0b" : "#495057", fontSize: "0.8rem" }}>
                {complete ? "Решено" : waiting ? "Пауза" : captchaId ? `${solvedCount}/${assigned.length}` : "—"}
              </span>
              <button className="btn btn-sm btn-outline-secondary" onClick={handleReconnect}
                style={{ fontSize: "0.7rem", padding: "2px 6px" }} title="Переподключиться">
                ↻
              </button>
            </div>
          </div>
          <div className="p-3 text-center">
            {mainImage && !waiting && !complete ? (
              <>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img
                    ref={imgRef}
                    src={"data:image/png;base64," + mainImage}
                    alt="Капча"
                    onLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                    onClick={handleClick}
                    style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", cursor: "crosshair", borderRadius: 6, border: "1px solid #30363d" }}
                    draggable={false}
                  />
                  {naturalSize && [...markers, ...foreignMarkers].map((m, i) => {
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
                          width: "32px", height: "32px", borderRadius: "50%",
                          background: colors[colorIdx],
                          border: "3px solid #fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: "16px", fontWeight: "bold",
                          boxShadow: "0 0 12px rgba(0,0,0,0.6)",
                        }}>
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {allIcons.length > 0 && (
                  <div style={{
                    display: "flex", gap: 6, justifyContent: "center", alignItems: "center",
                    marginTop: 10, padding: "8px 6px",
                    background: "#0d1117", borderRadius: 8, border: "1px solid #21262d",
                  }}>
                    {allIcons.map((ic) => {
                      const isCurrent = ic.position === currentPos;
                      const isAnswered = answeredPositions.includes(ic.position);
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
                <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 8 }}>
                  {(function () {
                    return Array.from({ length: 5 }, (_, i) => (
                      <div key={i} style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: assigned.includes(i)
                          ? (answeredPositions.includes(i) ? "#3fb950" : i === currentPos ? "#58a6ff" : "#6c757d")
                          : answeredPositions.includes(i) ? "#2ea043" : "#30363d",
                      }} />
                    ));
                  })()}
                </div>
              </>
            ) : (
              <div style={{ padding: "24px 0" }}>
                <div className="idle-spinner" style={{ margin: "0 auto" }} />
                <div style={{ color: "#8b949e", fontSize: "0.85rem", marginTop: 12 }}>
                  {complete ? "Капча решена, ожидание следующей..." : "Ожидание новой капчи..."}
                </div>
              </div>
            )}
            <div style={{ fontSize: 11, color: "#8b949e", marginTop: 8, maxHeight: 100, overflowY: "auto", textAlign: "left" }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.cls === "success" ? "#3fb950" : l.cls === "error" ? "#f85149" : "#8b949e" }}>
                  {l.time} {l.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
