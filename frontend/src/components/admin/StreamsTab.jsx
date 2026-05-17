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
      <h2 className="fs-6 fw-semibold mb-3">Подключённые SSE-клиенты</h2>
      {streamsLoading && streams.length === 0 && (
        <p className="text-muted text-center">Загрузка…</p>
      )}
      {streams.length === 0 && !streamsLoading && (
        <p className="text-muted text-center">Нет активных подключений</p>
      )}
      {streams.length > 0 && (
        <div className="table-responsive">
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
    </div>
  );
}
