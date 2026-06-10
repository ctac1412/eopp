import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import OperatorHeader from "../components/operator/OperatorHeader";
import CaptchaArea from "../components/operator/CaptchaArea";
import OperatorSidebar from "../components/operator/OperatorSidebar";
import ReadinessPopup from "../components/operator/ReadinessPopup";
import { playTickSound, playOperatorCaptchaSound, playReadinessStart, playScheduledNew } from "../utils/sounds";
import useCaptchaStore from "../store/useCaptchaStore";

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
  const [fellowOperators, setFellowOperators] = useState([]);
  const [captchaQueue, setCaptchaQueue] = useState([]);
  const [activeIndex, setActiveIndexRaw] = useState(-1);
  const [answering, setAnswering] = useState(false);
  const [log, setLog] = useState([]);
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const esRef = useRef(null);
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [iconDisplayMode, setIconDisplayMode] = useState(null);
  const [showReassignNotify, setShowReassignNotify] = useState(false);
  const [operatorNickname, setOperatorNickname] = useState("");
  const [reassignMasterId, setReassignMasterId] = useState(null);
  const [readinessCheck, setReadinessCheck] = useState(null);

  const connectedOpsFromStore = useCaptchaStore((s) => s.connectedOperators);
  const connectedOpsTags = (connectedOpsFromStore || []).filter(
    (op) => op.assigned_icons != null && op.assigned_icons.length > 0
  );

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

  useEffect(() => {
    const mode = iconDisplayMode === "own_only" ? "Только свои" : "Свои+чужие";
    document.title = `${operatorNickname || "Оператор"} — ${mode}`;
  }, [iconDisplayMode, operatorNickname]);

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
        const fellows = msg.fellow_operators || [];
        setFellowOperators(fellows);
        if (fellows.length > 0) {
          addLog(`Операторов в сделке: ${fellows.length + 1} (${fellows.map(f => f.nickname || `#${f.id}`).join(", ")})`, "info");
        }
        // scheduled events
        if (msg.scheduled_events && Array.isArray(msg.scheduled_events)) {
          setScheduledEvents(msg.scheduled_events);
        }
        // icon display mode
        if (msg.icon_display_mode) {
          setIconDisplayMode(msg.icon_display_mode);
        }
        if (msg.nickname) {
          setOperatorNickname(msg.nickname);
        }
        if (msg.chat_history && Array.isArray(msg.chat_history)) {
          useCaptchaStore.getState().setChatMessages(msg.chat_history);
        }
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
      if (msg.type === "operator_connected") {
        setFellowOperators((prev) => {
          if (prev.find((f) => f.id === msg.operator_id)) return prev;
          addLog(`Оператор «${msg.operator_nickname || `#${msg.operator_id}`}» подключился`, "success");
          return [...prev, { id: msg.operator_id, nickname: msg.operator_nickname }];
        });
        return;
      }
      if (msg.type === "operator_disconnected") {
        setFellowOperators((prev) => {
          const fop = prev.find((f) => f.id === msg.operator_id);
          if (!fop) return prev;
          addLog(`Оператор «${msg.operator_nickname || `#${msg.operator_id}`}» отключился`, "error");
          return prev.filter((f) => f.id !== msg.operator_id);
        });
        return;
      }
      if (msg.type === "operator_slots") {
        useCaptchaStore.getState().setOperatorSlots(msg.slots || []);
        return;
      }
      if (msg.type === "master_reassigned") {
        setShowReassignNotify(true);
        setReassignMasterId(msg.master_key_id || null);
        addLog(`Мастер сменился на #${msg.master_key_id}`, "error");
        return;
      }
      if (msg.type === "scheduled_event") {
        setScheduledEvents((prev) => [...prev, msg]);
        playScheduledNew();
        addLog(`Новое событие: ${msg.label || msg.description || "—"}`, "info");
        return;
      }
      if (msg.type === "chat_message") {
        useCaptchaStore.getState().addChatMessage({
          sender_role: msg.sender_role || "unknown",
          sender_label: msg.sender_label || "",
          message: msg.message || "",
          timestamp: msg.timestamp || new Date().toISOString(),
        });
        return;
      }
      if (msg.type === "readiness_check") {
        const sec = msg.countdown || 20;
        setReadinessCheck({ countdown: sec, timer: sec });
        playReadinessStart();
        addLog(`Проверка готовности — ${sec} сек`, "info");
        return;
      }
      if (msg.type === "disconnected") {
        addLog("Переподключение...", "error");
        es.close();
        return;
      }
      if (msg.type === "new_captcha" && msg.distribution && msg.distribution.operator_id > 0) {
        playOperatorCaptchaSound();
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

  // Readiness check countdown
  useEffect(() => {
    if (!readinessCheck || readinessCheck.timer <= 0) return;
    const timer = setInterval(() => {
      setReadinessCheck((prev) => {
        if (!prev || prev.timer <= 0) return null;
        playTickSound();
        const next = prev.timer - 1;
        if (next <= 0) {
          addLog("Время вышло — отключение", "error");
          disconnect();
          saveMaster(uuid, null, null);
          setMasterId(null);
          return null;
        }
        return { ...prev, timer: next };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [readinessCheck?.countdown]);

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

  const handleReadyClick = () => {
    if (masterId) {
      fetch("/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_role: "operator",
          sender_id: 0,
          sender_label: operatorNickname || "Оператор",
          message: "Я на месте",
          master_key_id: masterId,
        }),
      }).catch(() => {});
    }
    setReadinessCheck(null);
    addLog("Готов!", "success");
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
    <div className="container-fluid py-3">
      <ReadinessPopup readinessCheck={readinessCheck} handleReadyClick={handleReadyClick} />

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
        <div>
          {/* Main container */}
          <div style={{
            display: "flex", flexDirection: "column", height: "calc(100vh - 120px)",
            background: "#161b22", border: "1px solid #30363d", borderRadius: "0.375rem",
            marginRight: connected ? 260 : 0, transition: "margin-right 0.2s",
          }}>
            <OperatorHeader
              masterOnline={masterOnline}
              masterId={masterId}
              masters={masters}
              connected={connected}
              connecting={connecting}
              operatorNickname={operatorNickname}
              iconDisplayMode={iconDisplayMode}
              fellowOperators={fellowOperators}
              queueLen={queueLen}
              active={active}
              hasActive={hasActive}
              uuid={uuid}
              handleMasterChange={handleMasterChange}
              handleReconnect={handleReconnect}
              handleDisconnect={() => {
                if (masterId) {
                  fetch("/chat/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sender_role: "system",
                      sender_id: 0,
                      sender_label: "Система",
                      message: `${operatorNickname || "Оператор"} отключился`,
                      master_key_id: masterId,
                    }),
                  }).catch(() => {});
                }
                disconnect();
                saveMaster(uuid, null, null);
                setMasterId(null);
              }}
            />

            <CaptchaArea
              active={active}
              iconDisplayMode={iconDisplayMode}
              naturalSize={naturalSize}
              imgRef={imgRef}
              handleClick={handleClick}
              onImgLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              queueLen={queueLen}
            />

            {/* Log */}
            <div style={{
              flexShrink: 0, height: 36, overflowY: "auto",
              borderTop: "1px solid #30363d", padding: "2px 12px",
              fontSize: 9, color: "#8b949e", textAlign: "left",
              background: "#0d1117",
            }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.cls === "success" ? "#3fb950" : l.cls === "error" ? "#f85149" : "#8b949e" }}>
                  {l.time} {l.msg}
                </div>
              ))}
            </div>

            {/* Master Reassigned Notification */}
            {showReassignNotify && (
              <div style={{
                padding: "8px 12px", borderTop: "1px solid #30363d",
                background: "#2d1a1a", display: "flex", alignItems: "center", justifyContent: "space-between",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: "0.8rem", color: "#f85149" }}>
                  Мастер перепривязал вас к ключу #{reassignMasterId}.{" "}
                  <button
                    className="btn btn-sm btn-outline-warning"
                    style={{ fontSize: "0.7rem", padding: "2px 8px" }}
                    onClick={() => {
                      setShowReassignNotify(false);
                      handleReconnect();
                    }}
                  >
                    Переподключиться
                  </button>
                </span>
                <button
                  className="btn btn-sm"
                  style={{ color: "#8b949e", fontSize: "0.7rem", background: "none", border: "none" }}
                  onClick={() => setShowReassignNotify(false)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <OperatorSidebar
            connected={connected}
            connectedOpsTags={connectedOpsTags}
            scheduledEvents={scheduledEvents}
            operatorNickname={operatorNickname}
            masterId={masterId}
          />
        </div>
      )}
    </div>
  );
}
