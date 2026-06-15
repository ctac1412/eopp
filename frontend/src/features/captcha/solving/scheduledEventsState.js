export function getFutureScheduledEvents(events, now = Date.now()) {
  return (Array.isArray(events) ? events : [])
    .map((event) => ({
      ...event,
      scheduledAt: event?.scheduled_at ? new Date(event.scheduled_at).getTime() : 0,
    }))
    .filter((event) => Number.isFinite(event.scheduledAt) && event.scheduledAt > now)
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
}

export function getNextScheduledEvent(events, now = Date.now()) {
  return getFutureScheduledEvents(events, now)[0] || null;
}

function scheduledEventKey(event) {
  const apiKeyId = event?.api_key_id ?? "";
  const label = event?.label || "";
  return `${apiKeyId}:${label}`;
}

export function upsertScheduledEvent(events, event) {
  if (!event) return Array.isArray(events) ? events : [];
  const nextKey = scheduledEventKey(event);
  const existing = Array.isArray(events) ? events : [];
  return [
    ...existing.filter((item) => scheduledEventKey(item) !== nextKey),
    event,
  ];
}

export function formatScheduledCountdown(diffMs) {
  const diff = Math.max(0, diffMs);
  const totalHours = Math.floor(diff / 3600000);
  const mm = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
  const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
  if (totalHours >= 24) {
    return `${Math.floor(totalHours / 24)}д ${String(totalHours % 24).padStart(2, "0")}:${mm}`;
  }
  return `${String(totalHours).padStart(2, "0")}:${mm}:${ss}`;
}
