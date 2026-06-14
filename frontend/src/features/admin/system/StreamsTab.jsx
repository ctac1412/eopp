import React, { useEffect, useMemo, useState } from "react";
import { Alert, Card, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../../ui";

const EVENT_LABELS = {
  claim: "Claim",
  publish: "Publish",
  fail: "Fail",
  wait_end: "Wait OK",
  wait_timeout: "Wait timeout",
  master_alive: "Master alive",
};

const EVENT_STATUS_OPTIONS = [
  { value: "all", label: "Все события" },
  { value: "master", label: "Master" },
  { value: "slave", label: "Slave" },
  { value: "timeout", label: "Timeout" },
  { value: "errors", label: "Ошибки" },
];

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, seconds || 0);
  if (safeSeconds >= 3600) {
    return `${Math.floor(safeSeconds / 3600)}ч ${Math.floor((safeSeconds % 3600) / 60)}м`;
  }
  if (safeSeconds >= 60) {
    return `${Math.floor(safeSeconds / 60)}м ${safeSeconds % 60}с`;
  }
  return `${safeSeconds}с`;
}

function shortClientId(id) {
  if (!id) return "—";
  if (id.startsWith("test-variant-")) return id.replace("test-variant-", "v");
  if (id.length > 12) return `${id.slice(0, 12)}...`;
  return id;
}

function eventKey(ev) {
  return [
    ev.timestamp,
    ev.type,
    ev.group_key,
    ev.client_id,
    JSON.stringify(ev.details || {}),
  ].join("|");
}

function getGroupLabel(groupKey, details) {
  const meta = details?.meta;
  if (meta?.reservationId && meta?.facilityId) {
    const facility = meta.facilityId.slice(0, 8);
    const reservation = meta.reservationId;
    if (reservation.startsWith("test-variant-")) {
      return `v${reservation.replace("test-variant-", "")} / ${facility}...`;
    }
    return `${reservation.slice(0, 8)}... / ${facility}...`;
  }
  const parts = groupKey?.split(":") || [];
  if (parts.length >= 3) return `${parts[1].slice(0, 8)}... / ${parts[2]}`;
  return groupKey || "—";
}

function getEventTone(event) {
  if (event.type === "wait_timeout" || event.type === "fail") return "failed";
  if (event.type === "wait_end" || event.type === "publish") return "confirmed";
  if (event.details?.role === "master") return "warning";
  if (event.details?.role === "slave") return "online";
  return "neutral";
}

function eventMatchesFilter(event, filter) {
  if (filter === "all") return true;
  if (filter === "master") return event.details?.role === "master";
  if (filter === "slave") return event.details?.role === "slave";
  if (filter === "timeout") return event.type === "wait_timeout";
  if (filter === "errors") return event.type === "fail" || event.details?.error;
  return true;
}

export function StreamsTab({ streams, streamsLoading, adminToken }) {
  const [events, setEvents] = useState([]);
  const [slotsStats, setSlotsStats] = useState(null);
  const [connected, setConnected] = useState(false);
  const [eventFilter, setEventFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [clearResult, setClearResult] = useState(null);
  const [clearLoading, setClearLoading] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!adminToken) return undefined;

    const url = "/admin/stream/slots";
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "events") {
          setEvents((prev) => {
            const seen = new Set(prev.map(eventKey));
            const fresh = data.events.filter((ev) => {
              const key = eventKey(ev);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            const merged = [...fresh, ...prev];
            return merged.length > 200 ? merged.slice(0, 200) : merged;
          });
          setSlotsStats(data.stats);
        }
      } catch {
        // Ignore malformed diagnostic stream events.
      }
    };
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [adminToken]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!eventMatchesFilter(event, eventFilter)) return false;
        if (!normalizedSearch) return true;
        const details = event.details || {};
        const haystack = [
          event.type,
          event.group_key,
          event.client_id,
          details.role,
          details.status,
          details.error,
          getGroupLabel(event.group_key, details),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      }),
    [eventFilter, events, normalizedSearch],
  );

  const streamMetrics = useMemo(() => {
    const uniqueKeys = new Set(streams.map((stream) => stream.api_key_id).filter((value) => value != null));
    const uniqueIps = new Set(streams.map((stream) => stream.ip).filter(Boolean));
    return [
      { key: "clients", label: "SSE клиенты", value: streams.length, tone: streams.length > 0 ? "success" : "neutral" },
      { key: "keys", label: "Ключи", value: uniqueKeys.size, tone: uniqueKeys.size > 0 ? "info" : "neutral" },
      { key: "ips", label: "IP", value: uniqueIps.size, tone: uniqueIps.size > 0 ? "info" : "neutral" },
      { key: "slot-stream", label: "Slot stream", value: connected ? "on" : "off", tone: connected ? "success" : "warning" },
      { key: "events", label: "События", value: events.length, tone: events.length > 0 ? "info" : "neutral" },
    ];
  }, [connected, events.length, streams]);

  const slotMetrics = useMemo(
    () => [
      { key: "groups", label: "Группы", value: slotsStats?.groups ?? "—", tone: "neutral" },
      { key: "ready", label: "Готово", value: slotsStats?.ready ?? "—", tone: "success" },
      { key: "pending", label: "Ожидают", value: slotsStats?.pending ?? "—", tone: "warning" },
    ],
    [slotsStats],
  );

  const clearSlotGroups = async () => {
    if (!adminToken) return;
    setClearLoading(true);
    setClearResult(null);
    try {
      const res = await fetch("/admin/slots-group/clear", {
        method: "POST",
        headers: {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
      setEvents([]);
      setSlotsStats(data.stats || null);
      setClearResult("Группы слотов сброшены");
    } catch (err) {
      setClearResult(err.message);
    } finally {
      setClearLoading(false);
    }
  };

  const streamColumns = [
    {
      title: "Key",
      dataIndex: "api_key_id",
      width: 90,
      render: (value) => <span className="font-monospace">{value ?? "—"}</span>,
    },
    {
      title: "Label",
      dataIndex: "api_key_label",
      ellipsis: true,
      render: (value) => value || "—",
    },
    {
      title: "IP",
      dataIndex: "ip",
      width: 150,
      render: (value) => <span className="font-monospace">{value || "—"}</span>,
    },
    {
      title: "Подключён",
      dataIndex: "connected_at_iso",
      width: 170,
      render: formatDate,
    },
    {
      title: "Длительность",
      dataIndex: "connected_at",
      width: 120,
      render: (value) => formatDuration(value ? now - value : 0),
    },
  ];

  const eventColumns = [
    {
      title: "Время",
      dataIndex: "timestamp",
      width: 90,
      render: formatTs,
    },
    {
      title: "Событие",
      dataIndex: "type",
      width: 140,
      render: (value, event) => (
        <StatusTag status={getEventTone(event)} label={EVENT_LABELS[value] || value || "—"} />
      ),
    },
    {
      title: "Роль",
      width: 90,
      render: (_, event) => event.details?.role || "—",
    },
    {
      title: "Группа",
      dataIndex: "group_key",
      width: 180,
      ellipsis: true,
      render: (value, event) => (
        <span className="font-monospace stream-cell-clip" title={value || "—"}>
          {getGroupLabel(value, event.details || {})}
        </span>
      ),
    },
    {
      title: "Client",
      dataIndex: "client_id",
      width: 130,
      ellipsis: true,
      render: (value) => <span className="font-monospace">{shortClientId(value)}</span>,
    },
    {
      title: "Детали",
      width: 300,
      ellipsis: true,
      render: (_, event) => {
        const detail = event.details || {};
        const chunks = [
          detail.status,
          detail.error,
          detail.ttl != null ? `ttl:${detail.ttl}с` : "",
          detail.remaining != null ? `ждёт ${detail.remaining}с` : "",
          detail.waiters != null ? `waiters:${detail.waiters}` : "",
          detail.slots_count != null ? `${detail.slots_count} слотов` : "",
        ].filter(Boolean);
        const text = chunks.join(" · ") || "—";
        return <span title={text}>{text}</span>;
      },
    },
  ];

  return (
    <div data-eopp-component="StreamsTab" className="streams-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">SSE и общие слоты</h2>
            <div className="small text-muted">
              Подключения клиентов, состояние slot stream и последние события групп
            </div>
          </div>
        }
        right={
          <Space wrap>
            <StatusTag status={connected ? "online" : "offline"} label={connected ? "slot stream on" : "slot stream off"} />
            <Button size="small" variant="danger" onClick={clearSlotGroups} loading={clearLoading}>
              Сбросить группы
            </Button>
          </Space>
        }
      />

      <MetricsStrip items={streamMetrics} />

      {clearResult && (
        <Alert
          data-eopp-component="StreamsClearResult"
          className="my-3"
          type={clearResult.includes("HTTP") ? "error" : "success"}
          showIcon
          message={clearResult}
        />
      )}

      <Card data-eopp-component="StreamsClientsCard" className="mt-3" size="small" title="Подключённые SSE-клиенты">
        <DataTable
          className="streams-clients-table"
          rowKey={(row) => `${row.api_key_id ?? "anon"}-${row.ip}-${row.connected_at}`}
          data={streams}
          columns={streamColumns}
          loading={streamsLoading}
          emptyText="Нет активных подключений"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
        />
      </Card>

      <Card data-eopp-component="StreamsSlotsCard" className="mt-3" size="small" title="Общие слоты">
        <div className="streams-slot-metrics">
          <MetricsStrip items={slotMetrics} />
        </div>

        <FilterBar className="my-3">
          <label className="form-label small mb-0">
            Тип событий
            <SelectInput
              size="small"
              value={eventFilter}
              onChange={(value) => setEventFilter(value || "all")}
              options={EVENT_STATUS_OPTIONS}
              allowClear={false}
              style={{ minWidth: 170 }}
            />
          </label>
          <label className="form-label small mb-0 streams-event-search">
            Поиск
            <TextInput
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="group, client, role, error"
            />
          </label>
        </FilterBar>

        <DataTable
          className="streams-events-table"
          rowKey={eventKey}
          data={filteredEvents}
          columns={eventColumns}
          emptyText={connected ? "Ожидание событий" : "Нет подключения к slot stream"}
          pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100] }}
        />
      </Card>
    </div>
  );
}
