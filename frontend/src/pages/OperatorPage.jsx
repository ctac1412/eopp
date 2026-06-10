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

/** Create a fresh captcha entry for the queue. */
function makeQueueEntry(msg) {
  return {
    captchaId: msg.captcha_id,
    operatorId: msg.distribution.operator_id,
    assigned: msg.distribution.assigned,
    mainImage: msg.images?.["0"] || "",
    iconImage: msg.icons_image || "",
    allIcons: msg.all_icons || [],
    currentPos: msg.distribution.assigned[0],
    solvedCount: 0,
    answeredPositions: [],
    markers: [],
    foreignMarkers: [],
    complete: false,
    waiting: false,
  };
}

export function OperatorPage() {
  const { uuid } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [masters, setMasters] = useState([]);
  const [masterId, setMasterId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [masterOnline, setMasterOnline] = useState(false);
  const [captchaQueue, setCaptchaQueue] = useState([]);
  const [activeIndex, setActiveIndexRaw] = useState(-1);
  const [answering, setAnswering] = useState(false);
  const [log, setLog] = useState([]);
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const esRef = useRef(null);

  /* refs point to the active entry (or null when idle) */
  const activeRef = useRef(null);
  const captchaIdRef = useRef("");
  const assignedRef = useRef([]);
  const operatorIdRef = useRef(0);
  const masterIdRef = useRef(null);
  const activeIndexRef = useRef(-1);

  const addLog = useCallback((msg, cls) => {
    setLog((prev) => [{ time: new Date().toLocaleTimeString(), msg, cls: cls || "info" }, ...prev.slice(0, 49)]);
  }, []);

  /* keep activeRef in sync with queue + index */
  const updateActiveRef = useCallback((queue, idx) => {
    const entry = idx >= 0 ? queue[idx] : null;
    activeRef.current = entry;
    captchaIdRef.current = entry ? entry.captchaId : "";
    assignedRef.current = entry ? entry.assigned : [];
    operatorIdRef.current = entry ? entry.operatorId : 0;
  }, []);

  const disconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setConnected(false);
    setMasterOnline(false);
    setCaptchaQueue([]);
    setActiveIndex(-1);
    updateActiveRef([], -1);
    setNaturalSize(null);
  }, [updateActiveRef]);

  /** Update a field on the entry at the given index. */
  const updateEntry = useCallback((index, updates) => {
    setCaptchaQueue((prev) => {
      const next = [...prev];
      if (index >= 0 && index < next.length) {
        next[index] = { ...next[index], ...updates };
      }
      return next;
    });
  }, []);

  const clearCaptcha = useCallback(() => {
    setCaptchaQueue((prev) => {
      if (activeIndex < 0 || activeIndex >= prev.length) return prev;
      const next = [...prev];
      next[activeIndex] = {
        ...next[activeIndex],
        mainImage: "",
        iconImage: "",
        waiting: true,
        markers: [],
        foreignMarkers: [],
        answeredPositions: next[activeIndex].answeredPositions,
        allIcons: [],
      };
      return next;
    });
  }, [activeIndex]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  useEffect(() => {
    masterIdRef.current = masterId;
  }, [masterId]);

  const setActiveIndex = useCallback((idx) => {
    activeIndexRef.current = idx;
    setActiveIndexRaw(idx);
  }, []);

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
        const entry = makeQueueEntry(msg);
        setCaptchaQueue((prev) => {
          const next = [...prev, entry];
          const wasIdle = prev.length === 0;
          if (wasIdle) {
            setActiveIndex(next.length - 1);
            updateActiveRef(next, next.length - 1);
          }
          addLog(
            `Капча ${msg.captcha_id.slice(0, 8)}, иконки: ${msg.distribution.assigned.map((i) => i + 1).join(", ")}`
            + (!wasIdle ? ` (в очереди: ${next.length})` : ""),
            "info",
          );
          return next;
        });
        return;
      }
      if (msg.type === "captcha_solved") {
        setCaptchaQueue((prev) => {
          const cur = activeIndexRef.current;
          const idx = prev.findIndex((e) => e.captchaId === msg.captcha_id);
          if (idx < 0) return prev;
          const next = prev.filter((_, i) => i !== idx);
          let newIdx;
          if (idx === cur) {
            newIdx = next.length > 0 ? Math.min(idx, next.length - 1) : -1;
          } else if (idx < cur) {
            newIdx = cur - 1;
          } else {
            newIdx = cur;
          }
          setActiveIndex(newIdx);
          updateActiveRef(next, newIdx);
          addLog(idx === cur
            ? "Капча решена!"
            : `Капча ${msg.captcha_id.slice(0, 8)} решена (вне очереди)`, "success");
          if (idx === cur) {
            addLog(newIdx >= 0
              ? `Следующая: ${next[newIdx].captchaId.slice(0, 8)}`
              : "Очередь пуста, ожидание...", "info");
          }
          return next;
        });
        return;
      }
      if (msg.type === "captcha_timeout") {
        setCaptchaQueue((prev) => {
          const cur = activeIndexRef.current;
          const idx = prev.findIndex((e) => e.captchaId === msg.captcha_id);
          if (idx < 0) return prev;
          const next = prev.filter((_, i) => i !== idx);
          let newIdx;
          if (idx === cur) {
            newIdx = next.length > 0 ? Math.min(idx, next.length - 1) : -1;
          } else if (idx < cur) {
            newIdx = cur - 1;
          } else {
            newIdx = cur;
          }
          setActiveIndex(newIdx);
          updateActiveRef(next, newIdx);
          addLog(idx === cur
            ? "Капча: таймаут"
            : `Капча ${msg.captcha_id.slice(0, 8)} — таймаут (вне очереди)`, "error");
          if (idx === cur) {
            addLog(newIdx >= 0
              ? `Следующая: ${next[newIdx].captchaId.slice(0, 8)}`
              : "Очередь пуста, ожидание...", "info");
          }
          return next;
        });
        return;
      }
      if (msg.type === "distribution_progress") {
        setCaptchaQueue((prev) => {
          const idx = prev.findIndex((e) => e.captchaId === msg.captcha_id);
          if (idx < 0) return prev;
          const next = [...prev];
          const entry = { ...next[idx] };
          if (msg.answered_positions) {
            entry.answeredPositions = msg.answered_positions;
            entry.solvedCount = msg.answered_positions.filter((p) => entry.assigned.includes(p)).length;
          }
          if (msg.all_coords) {
            entry.foreignMarkers = Object.keys(msg.all_coords)
              .filter((pos) => msg.all_coords[pos].operator_id !== entry.operatorId)
              .map((pos) => ({ x: msg.all_coords[pos].x, y: msg.all_coords[pos].y, label: parseInt(pos) + 1 }));
          }
          next[idx] = entry;
          return next;
        });
        return;
      }
    };
    es.onopen = () => {
      addLog("SSE соединение установлено", "info");
    };
    es.onerror = () => addLog("SSE ошибка", "error");
  }, [uuid, disconnect, addLog, updateActiveRef]);

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

  /* ---- derived from active queue entry ---- */
  const active = activeIndex >= 0 ? captchaQueue[activeIndex] : null;

  const handleClick = async (e) => {
    if (!active || active.complete || active.waiting || answering || !naturalSize) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * naturalSize.w / rect.width);
    const y = Math.round((e.clientY - rect.top) * naturalSize.h / rect.height);

    setAnswering(true);
    try {
      const r = await fetch("/distribution/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captcha_id: active.captchaId,
          operator_id: active.operatorId,
          icon_position: active.currentPos ?? active.assigned[0],
          x, y,
        }),
      });
      const data = await r.json();

      if (!r.ok) {
        const nextPos = data.next_available ?? data.next_assigned;
        if ((r.status === 409 || r.status === 403) && nextPos != null) {
          updateEntry(activeIndex, { currentPos: nextPos });
          if (data.answered_positions) updateEntry(activeIndex, { answeredPositions: data.answered_positions });
          if (data.all_coords) {
            const f = Object.keys(data.all_coords)
              .filter((pos) => data.all_coords[pos].operator_id !== active.operatorId)
              .map((pos) => ({ x: data.all_coords[pos].x, y: data.all_coords[pos].y, label: parseInt(pos) + 1 }));
            updateEntry(activeIndex, { foreignMarkers: f });
          }
          addLog(`Пропуск: иконка #${(active.currentPos ?? 0) + 1} уже отвечена`, "info");
        } else if ((r.status === 409 || r.status === 403) && nextPos == null) {
          clearCaptcha();
          addLog("Все иконки отвечены, ожидание...", "info");
        } else if (r.status === 404) {
          clearCaptcha();
          addLog("Капча больше не активна", "error");
        } else {
          addLog(data.error || `Ошибка ${r.status}`, "error");
        }
        return;
      }

      if (data.coordinates) {
        addLog("Капча решена!", "success");
        return;
      }
      if (data.waiting) {
        setCaptchaQueue((prev) => {
          const idx = prev.findIndex((e) => e.captchaId === active.captchaId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], waiting: true, mainImage: "", iconImage: "", markers: [], foreignMarkers: [], allIcons: [] };
          return next;
        });
        addLog("Ваши иконки пройдены, ожидание...", "info");
        return;
      }
      updateEntry(activeIndex, {
        mainImage: data.image || active.mainImage,
        iconImage: data.icon || active.iconImage,
        currentPos: data.icon_position,
        solvedCount: data.solved_count,
        answeredPositions: data.answered_positions || active.answeredPositions,
        allIcons: data.all_icons || active.allIcons,
        markers: [...active.markers, { x, y, label: (active.currentPos ?? 0) + 1 }],
      });
      addLog(`Иконка #${(data.icon_position ?? 0) + 1} (${data.solved_count}/${active.assigned.length})`);
    } finally {
      setAnswering(false);
    }
  };

  const selectedMaster = masters.find((m) => m.id === masterId);
  const queueLen = captchaQueue.length;
  const hasActive = active && !active.complete && !active.waiting;

  return (
    <div className="container py-3" style={{ maxWidth: "700px" }}>
      {!connected ? (
        <div className="card p-4" style={{ background: "#161b22", border: "1px solid #30363d" }}>
          <h5 style={{ color: "#f0f6fc", marginBottom: 16 }}>
            Оператор распределённого решения
            <a href={`/training?op=${encodeURIComponent(uuid)}`} className="ms-2" style={{ fontSize: "0.8rem", color: "#58a6ff" }}>🎓 Тренировка</a>
          </h5>
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
                {hasActive
                  ? `Капча ${active.captchaId.slice(0, 8)}`
                  : active?.complete ? "Решено" : active?.waiting ? "Пауза" : `Ожидание капчи (мастер ${masterOnline ? "онлайн" : "офлайн"})`}
              </span>
              {queueLen > 1 && (
                <span className="badge" style={{ background: "#58a6ff", fontSize: "0.7rem" }}>
                  +{queueLen - 1}
                </span>
              )}
              <a href={`/training?op=${encodeURIComponent(uuid)}`} style={{ fontSize: "0.75rem", color: "#58a6ff", textDecoration: "none" }}>🎓</a>
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
              <span className="badge" style={{ background: active?.complete ? "#198754" : active?.waiting ? "#f59e0b" : "#495057", fontSize: "0.8rem" }}>
                {active?.complete ? "Решено" : active?.waiting ? "Пауза" : active ? `${active.solvedCount}/${active.assigned.length}` : "—"}
              </span>
              <button className="btn btn-sm btn-outline-secondary" onClick={handleReconnect}
                style={{ fontSize: "0.7rem", padding: "2px 6px" }} title="Переподключиться">
                ↻
              </button>
            </div>
          </div>
          <div className="p-3 text-center">
            {active?.mainImage && !active.waiting && !active.complete ? (
              <>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img
                    ref={imgRef}
                    src={"data:image/png;base64," + active.mainImage}
                    alt="Капча"
                    onLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                    onClick={handleClick}
                    style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", cursor: "crosshair", borderRadius: 6, border: "1px solid #30363d" }}
                    draggable={false}
                  />
                  {naturalSize && [...active.markers, ...active.foreignMarkers].map((m, i) => {
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
                {active.allIcons.length > 0 && (
                  <div style={{
                    display: "flex", gap: 6, justifyContent: "center", alignItems: "center",
                    marginTop: 10, padding: "8px 6px",
                    background: "#0d1117", borderRadius: 8, border: "1px solid #21262d",
                  }}>
                    {active.allIcons.map((ic) => {
                      const isCurrent = ic.position === active.currentPos;
                      const isAnswered = active.answeredPositions.includes(ic.position);
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
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: active.assigned.includes(i)
                        ? (active.answeredPositions.includes(i) ? "#3fb950" : i === active.currentPos ? "#58a6ff" : "#6c757d")
                        : active.answeredPositions.includes(i) ? "#2ea043" : "#30363d",
                    }} />
                  ))}
                </div>
              </>
            ) : (
              <div style={{ padding: "24px 0" }}>
                <div className="idle-spinner" style={{ margin: "0 auto" }} />
                <div style={{ color: "#8b949e", fontSize: "0.85rem", marginTop: 12 }}>
                  {active?.complete ? "Капча решена, ожидание следующей..."
                    : active?.waiting ? "Иконки пройдены, ожидание..."
                    : queueLen > 0 ? `В очереди: ${queueLen}`
                    : "Ожидание новой капчи..."}
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
