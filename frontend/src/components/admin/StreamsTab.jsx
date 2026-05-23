import React, { useEffect, useRef, useState } from "react";

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
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const EVENT_LABELS = {
  claim: "Claim",
  publish: "Publish",
  fail: "Fail",
  wait_end: "Wait OK",
  wait_timeout: "Wait timeout",
  master_alive: "Master alive",
};

function shortClientId(id) {
  if (!id) return "";
  if (id.startsWith("test-variant-")) return id.replace("test-variant-", "v");
  if (id.length > 12) return id.slice(0, 12) + "…";
  return id;
}

function GroupLabel({ groupKey, details }) {
  const meta = details?.meta;
  if (meta?.reservationId && meta?.facilityId) {
    const fac = meta.facilityId.slice(0, 8);
    const res = meta.reservationId;
    if (res.startsWith("test-variant-")) {
      return <span className="text-muted">v{res.replace("test-variant-", "")} / {fac}…</span>;
    }
    return <span className="text-muted">{res.slice(0, 8)}… / {fac}…</span>;
  }
  const parts = groupKey?.split(":") || [];
  if (parts.length >= 3) {
    return <span className="text-muted">{parts[1].slice(0, 8)}… / {parts[2]}</span>;
  }
  return <span className="text-muted">{groupKey}</span>;
}

export function StreamsTab({ streams, streamsLoading, adminToken }) {
  const [events, setEvents] = useState([]);
  const [slotsStats, setSlotsStats] = useState(null);
  const [connected, setConnected] = useState(false);
  const eventsRef = useRef(null);

  useEffect(() => {
    if (!adminToken) return;

    const url = `/admin/stream/slots?admin_token=${encodeURIComponent(adminToken)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "events") {
          setEvents((prev) => {
            const merged = [...data.events, ...prev];
            return merged.length > 200 ? merged.slice(0, 200) : merged;
          });
          setSlotsStats(data.stats);
        }
      } catch {}
    };
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [adminToken]);

  return (
    <div>
      <h2 className="fs-6 fw-semibold mb-3">Подключённые SSE-клиенты</h2>
      {streamsLoading && streams.length === 0 && (
        <p className="text-muted text-center">Загрузка…</p>
      )}
      {streams.length === 0 && !streamsLoading && (
        <p className="text-muted text-center">Нет активных подключений</p>
      )}
      {streams.length > 0 && (
        <div className="table-responsive mb-4">
          <table className="table table-sm table-hover table-bordered">
            <thead>
              <tr>
                <th>ID</th>
                <th>Label</th>
                <th>IP</th>
                <th>Время подключения</th>
                <th>Длительность</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s, idx) => {
                const elapsed = s.connected_at
                  ? Math.floor(Date.now() / 1000 - s.connected_at)
                  : 0;
                const durationStr =
                  elapsed >= 3600
                    ? `${Math.floor(elapsed / 3600)}ч ${Math.floor((elapsed % 3600) / 60)}м`
                    : elapsed >= 60
                      ? `${Math.floor(elapsed / 60)}м ${elapsed % 60}с`
                      : `${elapsed}с`;
                return (
                  <tr key={idx}>
                    <td className="font-monospace small">{s.api_key_id ?? "—"}</td>
                    <td>{s.api_key_label || "—"}</td>
                    <td className="font-monospace small">{s.ip || "—"}</td>
                    <td className="small">
                      {s.connected_at_iso
                        ? formatDate(s.connected_at_iso)
                        : "—"}
                    </td>
                    <td className="small">{durationStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="fs-6 fw-semibold mb-3">
        Общие слоты
        <span
          className={`ms-2 badge ${connected ? "bg-success" : "bg-secondary"}`}
          style={{ fontSize: "0.6rem", verticalAlign: "middle" }}
        >
          {connected ? "стрим активен" : "нет стрима"}
        </span>
      </h2>

      {slotsStats && (
        <div className="d-flex gap-3 mb-3 small align-items-center">
          <span className="text-muted">Групп: {slotsStats.groups}</span>
          <span className="text-success">Готово: {slotsStats.ready}</span>
          <span className="text-warning">Ожидают: {slotsStats.pending}</span>
          <button
            className="btn btn-sm btn-outline-danger ms-auto"
            onClick={async () => {
              await fetch("/admin/slots-group/clear", {
                method: "POST",
                headers: { "X-Admin-Token": adminToken },
              });
              setEvents([]);
            }}
            style={{ fontSize: "0.65rem", lineHeight: 1 }}
          >
            Сбросить группы
          </button>
        </div>
      )}

      <div
        ref={eventsRef}
        className="border rounded"
        style={{
          maxHeight: "400px",
          overflowY: "auto",
          fontFamily: "var(--bs-font-monospace)",
          fontSize: "0.75rem",
          background: "#1a1d23",
          color: "#e0e0e0",
        }}
      >
        {events.length === 0 && (
          <div className="p-3 text-center text-muted">
            {connected ? "Ожидание событий…" : "Подключение к стриму…"}
          </div>
        )}
        {events.map((ev, i) => {
          const label = EVENT_LABELS[ev.type] || ev.type;
          const detail = ev.details || {};
          const role = detail.role || "";
          const isSlave = role === "slave";
          const isTimeout = ev.type === "wait_timeout";
          const isAlive = ev.type === "master_alive";

          const status = detail.status || "";
          const extra = isAlive
            ? [`ждёт ${detail.remaining}с`, detail.waiters != null ? `waiters:${detail.waiters}` : ""]
            : [status, detail.error, detail.ttl != null ? `ttl:${detail.ttl}с` : "", detail.waiters != null ? `waiters:${detail.waiters}` : "", detail.slots_count != null ? `${detail.slots_count} слотов` : ""];
          const extraStr = extra.filter(Boolean).join(" ");

          return (
            <div
              key={i}
              className="px-2 py-1 border-bottom"
              style={{
                borderColor: "#333 !important",
                background: isSlave ? "rgba(0,255,100,0.04)" : isTimeout ? "rgba(255,80,80,0.08)" : isAlive ? "rgba(255,200,0,0.04)" : "transparent",
              }}
            >
              <span className="text-muted me-2">{formatTs(ev.timestamp)}</span>
              <span className={`me-1 ${role === "master" ? "text-warning" : role === "slave" ? "text-success" : ""}`}>
                {role === "master" ? "🟡" : role === "slave" ? "🟢" : "○"}
              </span>
              <span className={`me-2 ${isTimeout ? "text-danger" : isAlive ? "text-warning" : "text-info"}`}>
                {label}
              </span>
              {isSlave && <span className="text-success me-2 small">подписался</span>}
              <GroupLabel groupKey={ev.group_key} details={detail} />
              <span className="text-secondary ms-2">{shortClientId(ev.client_id)}</span>
              {extraStr && <span className={`ms-2 ${isTimeout ? "text-danger" : isAlive ? "text-warning" : "text-info"}`}>{extraStr}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
