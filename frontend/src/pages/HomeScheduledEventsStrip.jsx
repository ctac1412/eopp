import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildHomeScheduledEventTags } from "./homeScheduledEvents.js";
import { playScheduled3Sec } from "../utils/sounds";

export function HomeScheduledEventsStrip({ events = [], playSoonSound = false }) {
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(new Set());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const tags = useMemo(() => buildHomeScheduledEventTags(events, now), [events, now]);

  useEffect(() => {
    if (!playSoonSound) return;
    events.forEach((event, index) => {
      const scheduledAt = event.scheduled_at ? new Date(event.scheduled_at).getTime() : 0;
      const key = `${event.api_key_id ?? "key"}-${event.label || index}-${event.scheduled_at || index}`;
      const diff = scheduledAt - now;
      if (diff > 0 && diff <= 3500 && !firedRef.current.has(key)) {
        firedRef.current.add(key);
        playScheduled3Sec();
      }
    });
  }, [events, now, playSoonSound]);

  return (
    <div data-eopp-component="HomeScheduledEventsStrip" className="home-operator-strip home-scheduled-strip">
      <span className="home-operator-strip__label">Запланированы</span>
      <div className="home-operator-strip__tags">
        {tags.length === 0 ? (
          <span className="home-operator-strip__empty">нет запланированных</span>
        ) : (
          tags.map((event) => (
            <span
              key={event.key}
              className={`home-scheduled-tag ${event.urgent ? "is-urgent" : event.soon ? "is-soon" : ""}`}
              title={`${event.label}: ${event.time}`}
            >
              <span className="home-scheduled-tag__label">{event.label}</span>
              <span className="home-scheduled-tag__time">{event.time}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
