import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "antd";
import { useParams, useSearchParams } from "react-router-dom";
import OperatorHeader from "../components/operator/OperatorHeader";
import CaptchaArea from "../components/operator/CaptchaArea";
import OperatorSidebar from "../components/operator/OperatorSidebar";
import ReadinessPopup from "../components/operator/ReadinessPopup";
import { playTickSound, playOperatorCaptchaSound, playReadinessStart, playScheduledNew } from "../utils/sounds";
import useCaptchaStore from "../store/useCaptchaStore";
import { Button, WorkbenchPage } from "../ui";
import {
  applyOperatorAnswerResult,
  applyOperatorProgress,
  createOperatorQueueEntry,
  removeOperatorCaptcha,
} from "./operatorQueue";

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
  const [mastersLoaded, setMastersLoaded] = useState(false);
  const [masterId, setMasterId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [masterOnline, setMasterOnline] = useState(false);
  const [fellowOperators, setFellowOperators] = useState([]);
  const [captchaQueue, setCaptchaQueue] = useState([]);
  const [activeIndex, setActiveIndexRaw] = useState(-1);
  const [answering, setAnswering] = useState(false);
  const [log, setLog] = useState([]);
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
    document.title = `${operatorNickname || "Оператор"} - ${mode}`;
  }, [iconDisplayMode, operatorNickname]);

  const setActiveIndex = useCallback((idx) => {
    activeIndexRef.current = idx;
    setActiveIndexRaw(idx);
  }, []);

  const connectViaId = useCallback(async () => {
    disconnect();
    setConnecting(true);
    addLog("Подключение к SSE...", "info");
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
          addLog(`Операторов в связке: ${fellows.length + 1} (${fellows.map(f => f.nickname || `#${f.id}`).join(", ")})`, "info");
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
        const nextMasterId = msg.master_key_id || null;
        setMasterId(nextMasterId);
        setMasters((prev) => prev.map((master) => ({
          ...master,
          assigned: Number(master.id) === Number(nextMasterId),
        })));
        setMasterOnline(Boolean(msg.master_online));
        if (nextMasterId) {
          const nextLabel = msg.master_label || "";
          setMasters((prev) => (
            prev.some((master) => Number(master.id) === Number(nextMasterId))
              ? prev.map((master) => (
                Number(master.id) === Number(nextMasterId)
                  ? { ...master, label: nextLabel || master.label, assigned: true }
                  : { ...master, assigned: false }
              ))
              : [...prev, { id: nextMasterId, label: nextLabel, active: true, assigned: true }]
          ));
          saveMaster(uuid, nextMasterId, nextLabel);
          setSearchParams({});
        }
        setShowReassignNotify(true);
        setReassignMasterId(nextMasterId);
        addLog(`Мастер сменился на #${msg.master_key_id}`, "error");
        return;
      }
      if (msg.type === "scheduled_event") {
        setScheduledEvents((prev) => [...prev, msg]);
        playScheduledNew();
        addLog(`Новое событие: ${msg.label || msg.description || "-"}`, "info");
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
        addLog(`Проверка готовности - ${sec} сек`, "info");
        return;
      }
      if (msg.type === "disconnected") {
        addLog("Переподключение...", "error");
        es.close();
        return;
      }
      if (msg.type === "new_captcha") {
        const entry = createOperatorQueueEntry(msg);
        if (!entry) return;
        playOperatorCaptchaSound();
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
          const { queue: next, activeIndex: newIdx, removedIndex: idx } =
            removeOperatorCaptcha(prev, cur, msg.captcha_id);
          if (idx < 0) return prev;
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
          const { queue: next, activeIndex: newIdx, removedIndex: idx } =
            removeOperatorCaptcha(prev, cur, msg.captcha_id);
          if (idx < 0) return prev;
          setActiveIndex(newIdx);
          updateActiveRef(next, newIdx);
          const reason = msg.reason === "cancelled" ? "отменена пользователем" : "таймаут";
          addLog(idx === cur
            ? `Капча: ${reason}`
            : `Капча ${msg.captcha_id.slice(0, 8)} - ${reason} (вне очереди)`, "error");
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
        setCaptchaQueue((prev) => applyOperatorProgress(prev, msg.captcha_id, msg));
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
        setMastersLoaded(true);

        const found = active.find((m) => m.assigned);
        if (found) {
          setMasterId(found.id);
          saveMaster(uuid, found.id, found.label);
          if (found.label) {
            setSearchParams({ master: found.label }, { replace: true });
          }
        } else {
          setMasterId(null);
          saveMaster(uuid, null, null);
          setSearchParams({}, { replace: true });
        }
      });
  }, [uuid]);

  useEffect(() => {
    if (mastersLoaded && !connected && !connecting) {
      connectViaId();
    }
  }, [mastersLoaded, connected, connecting, connectViaId]);

  // Readiness check countdown
  useEffect(() => {
    if (!readinessCheck || readinessCheck.timer <= 0) return;
    const timer = setInterval(() => {
      setReadinessCheck((prev) => {
        if (!prev || prev.timer <= 0) return null;
        playTickSound();
        const next = prev.timer - 1;
        if (next <= 0) {
          addLog("Время вышло - отключение", "error");
          disconnect();
          return null;
        }
        return { ...prev, timer: next };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [readinessCheck?.countdown]);

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
    connectViaId();
  };

  /* ---- derived from active queue entry ---- */
  const active = activeIndex >= 0 ? captchaQueue[activeIndex] : null;

  const handleClick = async ({ x, y }) => {
    if (!active || active.complete || active.waiting || answering) return;
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
          setCaptchaQueue((prev) => applyOperatorProgress(prev, active.captchaId, data));
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
      const clickedMarker = { x, y, label: (active.currentPos ?? 0) + 1 };
      updateEntry(activeIndex, applyOperatorAnswerResult(active, data, clickedMarker));
      if (data.waiting) {
        addLog("Ваши иконки пройдены, ожидание...", "info");
        return;
      }
      addLog(`Иконка #${(data.icon_position ?? 0) + 1} (${data.solved_count}/${active.assigned.length})`);
    } finally {
      setAnswering(false);
    }
  };

  const selectedMaster = masters.find((m) => Number(m.id) === Number(masterId));
  const selectedMasterLabel = selectedMaster?.label || (masterId ? `Мастер #${masterId}` : "");
  const queueLen = captchaQueue.length;
  const hasActive = active && !active.complete && !active.waiting;

  return (
    <div className={connected ? "operator-page-root" : "container-fluid py-3"}>
      <ReadinessPopup readinessCheck={readinessCheck} handleReadyClick={handleReadyClick} />

      {!connected ? (
        <Card
          data-eopp-component="OperatorConnectCard"
          className="operator-connect-card"
          size="small"
        >
          <div className="operator-connect-card__header">
            <div>
              <h1 className="operator-connect-card__title">Оператор распределённого решения</h1>
              <div className="operator-connect-card__subtitle">
                {masterId
                  ? "Мастер назначен администратором. Подключитесь к очереди капч."
                  : "Подключитесь к операторскому каналу и ожидайте назначения мастера."}
              </div>
            </div>
            <a
              href={`/training?op=${encodeURIComponent(uuid)}`}
              className="operator-connect-card__training-link"
            >
              Тренировка
            </a>
          </div>
          <div className="operator-connect-card__field">
            <span>Назначенный мастер</span>
            <div
              data-eopp-component="OperatorAssignedMaster"
              className="operator-connect-card__assigned-master"
              title={selectedMasterLabel || "Мастер не назначен"}
            >
              {selectedMasterLabel || "Мастер не назначен"}
            </div>
          </div>
          <Button
            data-eopp-component="OperatorConnectButton"
            className="operator-connect-card__button"
            variant="primary"
            onClick={() => connectViaId()}
            disabled={connecting}
          >
            {connecting ? "Подключение..." : masterId ? "Подключиться" : "Войти в ожидание"}
          </Button>
        </Card>
      ) : (
        <WorkbenchPage
          main={
          <div className="operator-workbench-panel">
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
              }}
            />

            <CaptchaArea
              active={active}
              iconDisplayMode={iconDisplayMode}
              handleClick={handleClick}
              queueLen={queueLen}
            />

            <div className="operator-workbench-log">
              {log.map((l, i) => (
                <div key={i} className={`operator-workbench-log__row is-${l.cls || "info"}`}>
                  {l.time} {l.msg}
                </div>
              ))}
            </div>

            {/* Master Reassigned Notification */}
            {showReassignNotify && (
              <div className="operator-reassign-notice">
                <span className="operator-reassign-notice__text">
                  Мастер перепривязал вас к ключу #{reassignMasterId}.
                </span>
                <div className="operator-reassign-notice__actions">
                  <Button
                    data-eopp-component="OperatorReconnectButton"
                    size="small"
                    variant="secondary"
                    onClick={() => {
                      setShowReassignNotify(false);
                      handleReconnect();
                    }}
                  >
                    Переподключиться
                  </Button>
                  <Button
                    data-eopp-component="OperatorDismissReconnectButton"
                    size="small"
                    variant="secondary"
                    onClick={() => setShowReassignNotify(false)}
                    title="Скрыть уведомление"
                  >
                    ×
                  </Button>
                </div>
              </div>
            )}
          </div>
          }
          side={
            <OperatorSidebar
            connected={connected}
            connectedOpsTags={connectedOpsTags}
            scheduledEvents={scheduledEvents}
            operatorNickname={operatorNickname}
            masterId={masterId}
            embedded
          />
          }
        />
      )}
    </div>
  );
}
