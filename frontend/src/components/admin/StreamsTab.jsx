import React from "react";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StreamsTab({ streams, streamsLoading }) {
  return (
    <div>
      <h2 style={{ fontSize: "16px", marginBottom: "12px", fontWeight: 600 }}>
        Подключённые SSE-клиенты
      </h2>
      {streamsLoading && streams.length === 0 && (
        <div className="admin-loading">Загрузка…</div>
      )}
      {streams.length === 0 && !streamsLoading && (
        <div className="admin-empty">Нет активных подключений</div>
      )}
      {streams.length > 0 && (
        <div className="admin-table-wrapper">
          <table className="admin-table">
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
                    <td className="admin-id">{s.api_key_id ?? "—"}</td>
                    <td className="admin-label">{s.api_key_label || "—"}</td>
                    <td>{s.ip || "—"}</td>
                    <td className="admin-date">
                      {s.connected_at_iso
                        ? formatDate(s.connected_at_iso)
                        : "—"}
                    </td>
                    <td>{durationStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}