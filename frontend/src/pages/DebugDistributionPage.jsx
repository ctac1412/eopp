import React, { useEffect, useState } from "react";
import useCaptchaStore from "../store/useCaptchaStore";

export function DebugDistributionPage() {
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const [events, setEvents] = useState([]);
  const [allAnswers, setAllAnswers] = useState({});
  const [totalIcons, setTotalIcons] = useState(0);
  const [solved, setSolved] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    let closed = false;
    let es;

    function connect() {
      if (closed) return;
      const params = new URLSearchParams({ api_key: apiKey });
      es = new EventSource(`/stream?${params.toString()}`);

      es.onmessage = (e) => {
        if (closed) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "distribution_progress") {
            setTotalIcons((t) => t || msg.total_icons);
            setAllAnswers((prev) => ({ ...prev, [msg.icon_position]: { op: msg.operator_id, x: msg.x, y: msg.y } }));
            setEvents((prev) => [{ ...msg, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 199)]);
          }
          if (msg.type === "captcha_solved") setSolved(true);
        } catch {}
      };

      es.onerror = () => {
        es.close();
        if (!closed) setTimeout(connect, 3000);
      };
      setConnected(true);
    }

    connect();
    return () => { closed = true; if (es) es.close(); };
  }, [apiKey]);

  const grouped = Object.entries(allAnswers).reduce((acc, [pos, info]) => {
    if (!acc[info.op]) acc[info.op] = [];
    acc[info.op].push(parseInt(pos));
    return acc;
  }, {});

  if (!apiKey) return <div className="text-muted p-3">Требуется API ключ (в URL ?api_key=...)</div>;

  return (
    <div className="container py-3" style={{ maxWidth: "800px" }}>
      <div className="card" style={{ background: "#161b22", border: "1px solid #30363d" }}>
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom" style={{ borderColor: "#30363d" }}>
          <span className="fw-semibold" style={{ color: "#f0f6fc" }}>Debug: Distributed Captcha</span>
          <span className="badge" style={{ background: solved ? "#198754" : connected ? "#0d6efd" : "#6c757d", fontSize: "0.7rem" }}>
            {solved ? "Завершено" : connected ? "Подключен" : "—"}
          </span>
        </div>
        <div className="p-3">
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center text-muted py-4">Ожидание событий...</div>
          ) : (
            Object.entries(grouped).map(([opId, positions]) => {
              const label = opId === "0" ? "Мастер" : `Оператор #${opId}`;
              const color = opId === "0" ? "#58a6ff" : "#d29922";
              return (
                <div key={opId} className="d-flex align-items-center gap-3 mb-2" style={{ borderBottom: "1px solid #21262d", padding: "8px 0" }}>
                  <span style={{ minWidth: 100, fontWeight: 600, fontSize: "0.85rem", color }}>{label}</span>
                  <span style={{ fontSize: "0.75rem", color: "#8b949e" }}>{positions.length}/{totalIcons || 5}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {Array.from({ length: totalIcons || 5 }, (_, i) => (
                      <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: positions.includes(i) ? "#3fb950" : "#30363d" }} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {events.length > 0 && (
          <div className="p-3 border-top" style={{ borderColor: "#30363d", maxHeight: 250, overflowY: "auto" }}>
            <table className="table table-sm table-dark mb-0" style={{ fontSize: "0.7rem", fontFamily: "monospace" }}>
              <thead>
                <tr>
                  <th>Время</th><th>Оп</th><th>Поз</th><th>X</th><th>Y</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 100).map((ev, i) => (
                  <tr key={i} style={{ color: ev.operator_id === 0 ? "#58a6ff" : "#d29922" }}>
                    <td>{ev.time}</td>
                    <td>{ev.operator_id === 0 ? "master" : `op${ev.operator_id}`}</td>
                    <td>ик{ev.icon_position != null ? ev.icon_position + 1 : "?"}</td>
                    <td>{ev.x}</td>
                    <td>{ev.y}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
