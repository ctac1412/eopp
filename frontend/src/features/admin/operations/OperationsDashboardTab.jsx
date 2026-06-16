import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Space } from "antd";
import {
  Button,
  CheckboxField,
  TextInput,
  Toolbar,
} from "../../../ui";
import {
  formatScheduledCountdown,
  getFutureScheduledEvents,
} from "../../captcha/solving/scheduledEventsState";
import { buildOperationsScheduledSummary } from "./operationsScheduledSummary";
import { adminHeaders, adminHeadersJson, adminRequest } from "../shared/adminClient";
import { isAllAccessibleMasters, normalizeAllowedMasters } from "../operators/operatorAssignments";

function keyLabel(key) {
  return key.label || `Ключ #${key.id}`;
}

function companyLabel(value) {
  return value || "Без компании";
}

function masterCompanyLabel(master) {
  if (master.executor_all_companies === true) return "Все компании";
  if (Array.isArray(master.executor_company_names) && master.executor_company_names.length > 0) {
    return master.executor_company_names.filter(Boolean).join(", ");
  }
  return "Без доступа";
}

function operatorApiKeyId(operatorId) {
  return -Math.abs(Number(operatorId));
}

function getOperatorCompanyScope(op) {
  if (op.operator_all_companies === true) return { allCompanies: true, companyIds: [] };
  if (Array.isArray(op.operator_company_ids)) {
    return { allCompanies: false, companyIds: op.operator_company_ids.map(Number).filter(Boolean) };
  }
  return { allCompanies: false, companyIds: (op.company_ids || []).map(Number).filter(Boolean) };
}

function getKeyCompanyId(key) {
  const companyId = Array.isArray(key.executor_company_ids) && key.executor_company_ids.length === 1
    ? key.executor_company_ids[0]
    : key.company_id;
  return companyId == null ? null : Number(companyId);
}

function getMasterExecutorScope(master) {
  if (master.executor_all_companies === true) return { allCompanies: true, companyIds: [] };
  if (Array.isArray(master.executor_company_ids)) {
    return { allCompanies: false, companyIds: master.executor_company_ids.map(Number).filter(Boolean) };
  }
  const companyId = getKeyCompanyId(master);
  return { allCompanies: false, companyIds: companyId == null ? [] : [companyId] };
}

function operatorCompanyLabel(op) {
  if (op.operator_all_companies) return "Все компании";
  const names = Array.isArray(op.operator_company_names) && op.operator_company_names.length > 0
    ? op.operator_company_names
    : op.company_names;
  if (Array.isArray(names) && names.length > 0) return names.filter(Boolean).join(", ");
  return op.company_name || "Без компании";
}

function groupByLabel(items, getLabel) {
  const groups = new Map();
  items.forEach((item) => {
    const label = getLabel(item);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  });
  return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
}

function canAssignOperatorToMaster(op, master) {
  if (!op || !master) return false;
  if (!isAllAccessibleMasters(op.allowed_master_keys)) {
    const allowed = normalizeAllowedMasters(op.allowed_master_keys);
    if (!allowed.includes(Number(master.id))) return false;
  }
  const operatorScope = getOperatorCompanyScope(op);
  const executorScope = getMasterExecutorScope(master);
  if (executorScope.allCompanies) return true;
  if (!executorScope.companyIds.length) return false;
  if (operatorScope.allCompanies) return true;
  return operatorScope.companyIds.some((companyId) => executorScope.companyIds.includes(companyId));
}

function streamOnlineSet(streams) {
  return new Set(streams.map((stream) => Number(stream.api_key_id)).filter((id) => Number.isFinite(id)));
}

export function OperationsDashboardTab({ adminToken, onError }) {
  const [operators, setOperators] = useState([]);
  const [links, setLinks] = useState([]);
  const [keys, setKeys] = useState([]);
  const [streams, setStreams] = useState([]);
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [selectedOperatorIds, setSelectedOperatorIds] = useState([]);
  const [savingMasterId, setSavingMasterId] = useState(null);
  const [distributingActive, setDistributingActive] = useState(false);
  const [dragIntent, setDragIntent] = useState(null);
  const boardRef = useRef(null);
  const chipRefs = useRef(new Map());
  const selectionStartRef = useRef(null);
  const dragScrollAnimationRef = useRef(null);
  const dragScrollVelocityRef = useRef(0);
  const [selectionBox, setSelectionBox] = useState(null);
  const [adminBroadcastMessage, setAdminBroadcastMessage] = useState("");
  const [adminBroadcastSending, setAdminBroadcastSending] = useState(false);
  const [adminBroadcastStatus, setAdminBroadcastStatus] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [operatorsRes, linksRes, keysRes, streamsRes, scheduledRes] = await Promise.all([
        adminRequest("/admin/operators?include_test=0", { headers: adminHeaders(adminToken) }),
        adminRequest("/admin/operator-links?include_test=0", { headers: adminHeaders(adminToken) }),
        adminRequest("/api-keys?include_test=0", { headers: adminHeaders(adminToken) }),
        adminRequest("/admin/streams?include_test=0", { headers: adminHeaders(adminToken) }),
        adminRequest("/admin/scheduled-events?include_test=0", { headers: adminHeaders(adminToken) }),
      ]);
      const [operatorsData, linksData, keysData, streamsData, scheduledData] = await Promise.all([
        operatorsRes.json(),
        linksRes.json(),
        keysRes.json(),
        streamsRes.json(),
        scheduledRes.json(),
      ]);
      setOperators(Array.isArray(operatorsData) ? operatorsData : []);
      setLinks(Array.isArray(linksData) ? linksData : []);
      setKeys(Array.isArray(keysData) ? keysData : keysData.keys || []);
      setStreams(Array.isArray(streamsData) ? streamsData : []);
      setScheduledEvents(Array.isArray(scheduledData) ? scheduledData : []);
    } catch {
      onError?.("Ошибка загрузки оперативного дэшборда");
    }
  }, [adminToken, onError]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const onlineStreams = useMemo(() => streamOnlineSet(streams), [streams]);
  const masters = useMemo(() => keys.filter((key) => !key.is_external && key.is_master_key !== false), [keys]);
  const masterById = useMemo(() => new Map(masters.map((master) => [Number(master.id), master])), [masters]);
  const scheduledByMasterId = useMemo(() => {
    const map = new Map();
    getFutureScheduledEvents(scheduledEvents, now).forEach((event) => {
      const masterId = Number(event.api_key_id);
      if (!Number.isFinite(masterId) || map.has(masterId)) return;
      map.set(masterId, event);
    });
    return map;
  }, [now, scheduledEvents]);
  const activeLinkByOperatorId = useMemo(() => {
    const map = new Map();
    links.forEach((link) => map.set(Number(link.operator_id), link));
    return map;
  }, [links]);

  const onlineOperators = useMemo(
    () => operators.filter((op) => op.online || onlineStreams.has(operatorApiKeyId(op.id))),
    [onlineStreams, operators],
  );

  const operatorsByMasterId = useMemo(() => {
    const map = new Map();
    links.forEach((link) => {
      const operator = operators.find((op) => Number(op.id) === Number(link.operator_id));
      if (!operator) return;
      const masterId = Number(link.master_key_id);
      if (!map.has(masterId)) map.set(masterId, []);
      map.get(masterId).push(operator);
    });
    return map;
  }, [links, operators]);

  const assignedOperatorIds = useMemo(
    () => new Set(links.map((link) => Number(link.operator_id))),
    [links],
  );

  const unassignedOperators = useMemo(
    () => operators.filter((op) => !assignedOperatorIds.has(Number(op.id))),
    [assignedOperatorIds, operators],
  );

  const unassignedOnlineOperators = useMemo(
    () => unassignedOperators.filter((op) => op.online || onlineStreams.has(operatorApiKeyId(op.id))),
    [onlineStreams, unassignedOperators],
  );

  const unassignedOfflineOperators = useMemo(
    () => unassignedOperators.filter((op) => !op.online && !onlineStreams.has(operatorApiKeyId(op.id))),
    [onlineStreams, unassignedOperators],
  );

  const sortedMasters = useMemo(
    () => [...masters].sort((left, right) => {
      const leftOnline = onlineStreams.has(Number(left.id));
      const rightOnline = onlineStreams.has(Number(right.id));
      if (leftOnline !== rightOnline) return leftOnline ? -1 : 1;
      const byLabel = keyLabel(left).localeCompare(keyLabel(right), "ru", { sensitivity: "base" });
      if (byLabel !== 0) return byLabel;
      return Number(left.id) - Number(right.id);
    }),
    [masters, onlineStreams],
  );

  const masterGroups = useMemo(
    () => groupByLabel(sortedMasters, masterCompanyLabel),
    [sortedMasters],
  );
  const scheduledSummary = useMemo(
    () => buildOperationsScheduledSummary(scheduledEvents, masters, now),
    [masters, now, scheduledEvents],
  );

  const unassignedOnlineGroups = useMemo(
    () => groupByLabel(unassignedOnlineOperators, operatorCompanyLabel),
    [unassignedOnlineOperators],
  );

  const unassignedOfflineGroups = useMemo(
    () => groupByLabel(unassignedOfflineOperators, operatorCompanyLabel),
    [unassignedOfflineOperators],
  );

  const selectedOperators = useMemo(
    () => operators.filter((op) => selectedOperatorIds.includes(Number(op.id))),
    [operators, selectedOperatorIds],
  );

  useEffect(() => {
    if (!selectionBox) return undefined;

    const handleMove = (event) => {
      const start = selectionStartRef.current;
      const board = boardRef.current;
      if (!start || !board) return;
      const bounds = board.getBoundingClientRect();
      const currentX = event.clientX - bounds.left;
      const currentY = event.clientY - bounds.top;
      const left = Math.min(start.x, currentX);
      const top = Math.min(start.y, currentY);
      const width = Math.abs(currentX - start.x);
      const height = Math.abs(currentY - start.y);
      const nextBox = { left, top, width, height };
      setSelectionBox(nextBox);

      const selected = [];
      const absoluteBox = {
        left: bounds.left + left,
        top: bounds.top + top,
        right: bounds.left + left + width,
        bottom: bounds.top + top + height,
      };
      chipRefs.current.forEach((node, rawId) => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const intersects = rect.left <= absoluteBox.right
          && rect.right >= absoluteBox.left
          && rect.top <= absoluteBox.bottom
          && rect.bottom >= absoluteBox.top;
        if (intersects) selected.push(Number(rawId));
      });
      setSelectedOperatorIds(selected);
    };

    const handleUp = () => {
      selectionStartRef.current = null;
      setSelectionBox(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [selectionBox]);

  const toggleSelected = (operatorId, checked) => {
    setSelectedOperatorIds((prev) => {
      const ids = new Set(prev);
      if (checked) ids.add(Number(operatorId));
      else ids.delete(Number(operatorId));
      return Array.from(ids);
    });
  };

  const activateOperator = (operatorId, event) => {
    if (event.target.closest("input, label, button, a")) return;
    const id = Number(operatorId);
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      setSelectedOperatorIds((prev) => (
        prev.includes(id) ? prev : [...prev, id]
      ));
      return;
    }
    setSelectedOperatorIds([id]);
  };

  const stopDragAutoScroll = useCallback(() => {
    dragScrollVelocityRef.current = 0;
    if (dragScrollAnimationRef.current) {
      window.cancelAnimationFrame(dragScrollAnimationRef.current);
      dragScrollAnimationRef.current = null;
    }
  }, []);

  const updateDragAutoScroll = useCallback((event) => {
    const edgeSize = 96;
    const maxSpeed = 18;
    const y = event.clientY;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    let velocity = 0;

    if (y > 0 && y < edgeSize) {
      velocity = -Math.ceil(((edgeSize - y) / edgeSize) * maxSpeed);
    } else if (y > viewportHeight - edgeSize && y < viewportHeight) {
      velocity = Math.ceil(((y - (viewportHeight - edgeSize)) / edgeSize) * maxSpeed);
    }

    dragScrollVelocityRef.current = velocity;
    if (!velocity) {
      stopDragAutoScroll();
      return;
    }
    if (dragScrollAnimationRef.current) return;

    const step = () => {
      if (!dragScrollVelocityRef.current) {
        dragScrollAnimationRef.current = null;
        return;
      }
      window.scrollBy({ top: dragScrollVelocityRef.current, behavior: "auto" });
      dragScrollAnimationRef.current = window.requestAnimationFrame(step);
    };

    dragScrollAnimationRef.current = window.requestAnimationFrame(step);
  }, [stopDragAutoScroll]);

  useEffect(() => {
    if (!dragIntent) return undefined;

    window.addEventListener("dragover", updateDragAutoScroll);
    window.addEventListener("drop", stopDragAutoScroll);
    return () => {
      window.removeEventListener("dragover", updateDragAutoScroll);
      window.removeEventListener("drop", stopDragAutoScroll);
      stopDragAutoScroll();
    };
  }, [dragIntent, stopDragAutoScroll, updateDragAutoScroll]);

  const dragOperators = (event, operatorIds) => {
    setDragIntent({ type: "operators", operatorIds });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify({ operatorIds }));
    updateDragAutoScroll(event);
  };

  const startAreaSelection = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".ops-operator-chip, button, input, label, a, .ant-card-head")) return;
    const board = boardRef.current;
    if (!board) return;
    const bounds = board.getBoundingClientRect();
    const start = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    selectionStartRef.current = start;
    setSelectionBox({ left: start.x, top: start.y, width: 0, height: 0 });
    setSelectedOperatorIds([]);
    event.preventDefault();
  };

  const droppedOperatorIds = (event) => {
    try {
      const payload = JSON.parse(event.dataTransfer.getData("application/json") || "{}");
      return Array.isArray(payload.operatorIds) ? payload.operatorIds.map(Number).filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  const assignOperators = async (operatorIds, masterId) => {
    const master = masterById.get(Number(masterId));
    const candidates = operators.filter((op) => operatorIds.includes(Number(op.id)));
    const allowed = candidates.filter((op) => canAssignOperatorToMaster(op, master));
    if (!allowed.length) {
      onError?.("Нет операторов, которых можно назначить этому мастеру");
      return;
    }
    setSavingMasterId(Number(masterId));
    try {
      await Promise.all(allowed.map((op) => adminRequest(`/admin/operators/${op.id}/link`, {
        method: "PUT",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify({ master_key_id: Number(masterId) }),
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      })));
      setSelectedOperatorIds((prev) => prev.filter((id) => !allowed.some((op) => Number(op.id) === id)));
      await loadAll();
    } catch {
      onError?.("Ошибка назначения операторов");
    } finally {
      setSavingMasterId(null);
    }
  };

  const unassignOperators = async (operatorIds) => {
    const targets = operators.filter((op) => operatorIds.includes(Number(op.id)));
    setSavingMasterId(0);
    try {
      await Promise.all(targets.map((op) => {
        const link = activeLinkByOperatorId.get(Number(op.id));
        if (!link) return Promise.resolve();
        return adminRequest(`/operators/${op.uuid}/unlink`, {
          method: "POST",
          headers: adminHeadersJson(adminToken),
          body: JSON.stringify({ master_id: link.master_key_id }),
        }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        });
      }));
      setSelectedOperatorIds((prev) => prev.filter((id) => !operatorIds.includes(id)));
      await loadAll();
    } catch {
      onError?.("Ошибка снятия операторов с мастера");
    } finally {
      setSavingMasterId(null);
    }
  };

  const resetMaster = async (masterId) => {
    const ids = (operatorsByMasterId.get(Number(masterId)) || []).map((op) => Number(op.id));
    if (ids.length) await unassignOperators(ids);
  };

  const distributeActiveOperators = async () => {
    setDistributingActive(true);
    try {
      const response = await adminRequest("/admin/operator-distribution/active/round-robin", {
        method: "POST",
        headers: adminHeaders(adminToken),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.detail || `HTTP ${response.status}`);
      }
      setSelectedOperatorIds([]);
      await loadAll();
    } catch (error) {
      onError?.(error.message || "Ошибка распределения активных операторов");
    } finally {
      setDistributingActive(false);
    }
  };

  const sendAdminBroadcast = async () => {
    const text = adminBroadcastMessage.trim();
    if (!text) return;
    setAdminBroadcastSending(true);
    setAdminBroadcastStatus("");
    try {
      const response = await adminRequest("/admin/chat/broadcast", {
        method: "POST",
        json: {
          message: text,
          sender_label: "Администратор",
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.detail || `HTTP ${response.status}`);
      }
      setAdminBroadcastMessage("");
      setAdminBroadcastStatus(
        `Отправлено: мастеров ${data.active_masters || 0}, операторов ${data.delivered_to_operators || 0}`,
      );
      await loadAll();
    } catch (error) {
      onError?.(error.message || "Ошибка отправки общего сообщения");
    } finally {
      setAdminBroadcastSending(false);
    }
  };

  const handleMasterDrop = (event, masterId) => {
    event.preventDefault();
    stopDragAutoScroll();
    setDragIntent(null);
    const ids = droppedOperatorIds(event);
    if (ids.length) assignOperators(ids, masterId);
  };

  const handleUnassignedDrop = (event) => {
    event.preventDefault();
    stopDragAutoScroll();
    setDragIntent(null);
    const ids = droppedOperatorIds(event);
    if (ids.length) unassignOperators(ids);
  };

  const draggableIdsFor = (operatorId) => (
    selectedOperatorIds.includes(Number(operatorId)) ? selectedOperatorIds : [Number(operatorId)]
  );

  const masterDropClass = (master) => {
    if (!dragIntent) return "";
    if (dragIntent.type === "operators") {
      const draggedOperators = operators.filter((op) => dragIntent.operatorIds.includes(Number(op.id)));
      if (!draggedOperators.length) return "";
      return draggedOperators.every((op) => canAssignOperatorToMaster(op, master)) ? "can-drop" : "cannot-drop";
    }
    return "";
  };

  const renderOperatorChip = (op) => {
    const operatorOnline = op.online || onlineStreams.has(operatorApiKeyId(op.id));
    return (
      <div
        key={op.id}
        ref={(node) => {
          if (node) chipRefs.current.set(Number(op.id), node);
          else chipRefs.current.delete(Number(op.id));
        }}
        className={`ops-operator-chip ${selectedOperatorIds.includes(Number(op.id)) ? "is-selected" : ""}`}
        draggable
        onClick={(event) => activateOperator(op.id, event)}
        onDragStart={(event) => dragOperators(event, draggableIdsFor(op.id))}
        onDrag={(event) => updateDragAutoScroll(event)}
        onDragEnd={() => {
          stopDragAutoScroll();
          setDragIntent(null);
        }}
      >
        <CheckboxField
          checked={selectedOperatorIds.includes(Number(op.id))}
          onChange={(event) => toggleSelected(op.id, event.target.checked)}
        />
        <span className={`ops-status-dot ${operatorOnline ? "is-online" : ""}`} />
        <span className="ops-operator-chip__name">{op.nickname || `#${op.id}`}</span>
      </div>
    );
  };

  return (
    <div data-eopp-component="OperationsDashboardTab" className="ops-dashboard-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Оперативный дэшборд</h2>
            <div className="small text-muted">Быстрое распределение online-операторов между мастерами</div>
          </div>
        }
        right={<Button size="small" onClick={loadAll}>Обновить</Button>}
      />

      <div data-eopp-component="OpsScheduledSummary" className="ops-scheduled-summary">
        <div className="ops-scheduled-summary__stats">
          <div className="ops-scheduled-summary__stat">
            <span>Запланировано</span>
            <strong>{scheduledSummary.total}</strong>
          </div>
          <div className="ops-scheduled-summary__stat">
            <span>До 5 мин</span>
            <strong>{scheduledSummary.soon}</strong>
          </div>
          <div className="ops-scheduled-summary__stat ops-scheduled-summary__stat--urgent">
            <span>До 1 мин</span>
            <strong>{scheduledSummary.urgent}</strong>
          </div>
        </div>
        <div className="ops-scheduled-summary__masters">
          {scheduledSummary.byMaster.length === 0 ? (
            <div className="ops-scheduled-summary__empty">Нет запланированных стартов</div>
          ) : (
            scheduledSummary.byMaster.slice(0, 8).map((group) => (
              <div key={group.masterId} className="ops-scheduled-summary__master">
                <div className="ops-scheduled-summary__master-head">
                  <strong>{group.masterLabel}</strong>
                  <span>{group.nextCountdown}</span>
                </div>
                <div className="ops-scheduled-summary__events">
                  {group.events.slice(0, 3).map((event) => (
                    <span
                      key={`${group.masterId}-${event.label}-${event.scheduled_at}`}
                      className={`ops-scheduled-summary__event ${event.urgent ? "is-urgent" : event.soon ? "is-soon" : ""}`}
                      title={event.scheduled_at || ""}
                    >
                      {event.label || event.description || "Старт"} · {event.countdown}
                    </span>
                  ))}
                  {group.events.length > 3 && (
                    <span className="ops-scheduled-summary__more">+{group.events.length - 3}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div data-eopp-component="OpsAdminBroadcast" className="ops-admin-broadcast">
        <div className="ops-admin-broadcast__label">
          <strong>Общий чат</strong>
          <span>Сообщение уйдет во все активные чаты мастеров и их операторов</span>
        </div>
        <TextInput
          value={adminBroadcastMessage}
          onChange={(event) => setAdminBroadcastMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendAdminBroadcast();
            }
          }}
          placeholder="Сообщение администратора..."
          className="ops-admin-broadcast__input"
        />
        <Button
          size="small"
          variant="primary"
          onClick={sendAdminBroadcast}
          disabled={adminBroadcastSending || !adminBroadcastMessage.trim()}
        >
          {adminBroadcastSending ? "Отправляем..." : "Отправить всем"}
        </Button>
        {adminBroadcastStatus && (
          <span className="ops-admin-broadcast__status">{adminBroadcastStatus}</span>
        )}
      </div>

      <div className="ops-selection-surface mt-3">
        <div className="ops-selection-surface__head">
          <span>Рабочая область распределения</span>
          <span>Выделяйте операторов рамкой мыши и перетаскивайте к мастерам</span>
        </div>

        <div
          ref={boardRef}
          className={`ops-dashboard-grid ${selectionBox ? "is-selecting" : ""}`}
          onMouseDown={startAreaSelection}
        >
          {selectionBox && (
            <div
              className="ops-selection-box"
              style={{
                left: selectionBox.left,
                top: selectionBox.top,
                width: selectionBox.width,
                height: selectionBox.height,
              }}
            />
          )}
          <div className="ops-masters-board">
            {masterGroups.map((group) => (
              <div key={group.label} className="ops-company-group">
                <div className="ops-company-group__title">{group.label}</div>
                <div className="ops-company-group__masters">
                  {group.rows.map((master) => {
                    const assigned = operatorsByMasterId.get(Number(master.id)) || [];
                    const online = onlineStreams.has(Number(master.id));
                    const activeAssignedCount = assigned.filter((op) => (
                      op.online || onlineStreams.has(operatorApiKeyId(op.id))
                    )).length;
                    const scheduled = scheduledByMasterId.get(Number(master.id));
                    const scheduledDiffMs = scheduled ? scheduled.scheduledAt - now : 0;
                    const scheduledClass = scheduledDiffMs <= 60000
                      ? "is-urgent"
                      : scheduledDiffMs <= 300000
                        ? "is-soon"
                        : "";
                    return (
                      <Card
                        key={master.id}
                        data-eopp-component="OpsMasterCard"
                        className={`ops-master-card ${masterDropClass(master)}`}
                        size="small"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleMasterDrop(event, master.id)}
                        title={
                          <div className="ops-master-card__title">
                            <span className={`ops-status-dot ${online ? "is-online" : ""}`} />
                            <span className="ops-master-card__name">{keyLabel(master)}</span>
                            <span className="ops-master-card__id text-muted">#{master.id}</span>
                            <span
                              className={`ops-master-active-count ${activeAssignedCount > 0 ? "has-active" : ""}`}
                              title="Активные назначенные операторы"
                            >
                              {activeAssignedCount} online
                            </span>
                            {scheduled && (
                              <span
                                className={`ops-master-schedule ${scheduledClass}`}
                                title={`${scheduled.label || "Запланированный запуск"} ${scheduled.scheduled_at || ""}`}
                              >
                                {formatScheduledCountdown(scheduledDiffMs)}
                              </span>
                            )}
                          </div>
                        }
                        extra={
                          <Button
                            size="small"
                            variant="danger"
                            title="Сбросить мастера"
                            onClick={() => resetMaster(master.id)}
                            disabled={!assigned.length || savingMasterId === Number(master.id)}
                          >
                            ×
                          </Button>
                        }
                      >
                        <div className="ops-master-card__operators">
                          {assigned.map(renderOperatorChip)}
                          {assigned.length === 0 && <div className="ops-empty-slot">Перетащите оператора сюда</div>}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <Card
            data-eopp-component="OpsUnassignedPanel"
            className="ops-unassigned-panel"
            size="small"
            title="Нераспределенные операторы"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleUnassignedDrop}
            extra={
              <Space size={6}>
                <Button
                  size="small"
                  onClick={distributeActiveOperators}
                  disabled={distributingActive || !onlineOperators.length}
                >
                  {distributingActive ? "Распределяем..." : "Распределить активных"}
                </Button>
                {selectedOperators.length > 0 ? (
                  <Button size="small" onClick={() => unassignOperators(selectedOperatorIds)}>
                    Снять выбранных
                  </Button>
                ) : null}
              </Space>
            }
          >
            <div className="ops-unassigned-panel__body">
              <div className="ops-operator-status-section">
                <div className="ops-operator-status-section__title">Online</div>
                {unassignedOnlineGroups.map((group) => (
                  <div key={group.label} className="ops-operator-group">
                    <div className="ops-operator-group__title">{group.label}</div>
                    {group.rows.map(renderOperatorChip)}
                  </div>
                ))}
                {unassignedOnlineOperators.length === 0 && <div className="ops-empty-slot">Нет online без мастера</div>}
              </div>

              <div className="ops-operator-status-section ops-operator-status-section--offline">
                <div className="ops-operator-status-section__title">Offline</div>
                {unassignedOfflineGroups.map((group) => (
                  <div key={group.label} className="ops-operator-group">
                    <div className="ops-operator-group__title">{group.label}</div>
                    {group.rows.map(renderOperatorChip)}
                  </div>
                ))}
                {unassignedOfflineOperators.length === 0 && <div className="ops-empty-slot">Нет offline без мастера</div>}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
