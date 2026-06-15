import React, { useState, useEffect, useRef } from "react";
import { playScheduled3Sec } from "../../../utils/sounds";

export function ScheduledEvents({ events }) {
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(new Set());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const visible = events.filter((ev) => {
    const scheduledAt = ev.scheduled_at ? new Date(ev.scheduled_at).getTime() : 0;
    return scheduledAt > now;
  });

  // Play sound at 3 seconds remaining
  visible.forEach((ev) => {
    const scheduledAt = ev.scheduled_at ? new Date(ev.scheduled_at).getTime() : 0;
    const diff = scheduledAt - now;
    if (diff > 0 && diff <= 3500 && !firedRef.current.has(ev.scheduled_at)) {
      firedRef.current.add(ev.scheduled_at);
      playScheduled3Sec();
    }
  });

  if (visible.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: "0.7rem", color: "#8b949e", fontWeight: 600, marginBottom: 4 }}>
        Запланированные запуски
      </div>
      {visible.map((ev, i) => {
        const scheduledAt = ev.scheduled_at ? new Date(ev.scheduled_at).getTime() : 0;
        const diff = Math.max(0, scheduledAt - now);
        const totalHours = Math.floor(diff / 3600000);
        const mm = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
        const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
        const timeStr = totalHours >= 24
          ? `${Math.floor(totalHours / 24)}д ${String(totalHours % 24).padStart(2, "0")}:${mm}`
          : `${String(totalHours).padStart(2, "0")}:${mm}:${ss}`;

        return (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "3px 0", fontSize: "0.72rem", color: "#c9d1d9",
          }}>
            <span>{ev.label || ev.description || "Событие"}</span>
            <span style={{
              fontFamily: "var(--bs-font-monospace)", fontSize: "0.7rem",
              color: diff < 60000 ? "#f85149" : diff < 300000 ? "#d29922" : "#58a6ff",
            }}>
              {timeStr}
            </span>
          </div>
        );
      })}
    </div>
  );
}
