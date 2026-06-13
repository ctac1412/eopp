import { formatScheduledCountdown, getFutureScheduledEvents } from "../components/scheduledEventsState.js";

export function buildHomeScheduledEventTags(events = [], now = Date.now()) {
  return getFutureScheduledEvents(events, now).map((event, index) => {
    const label = event.label || event.description || "Старт";
    const diff = Math.max(0, event.scheduledAt - now);
    return {
      key: `${event.api_key_id ?? "key"}-${event.label || index}-${event.scheduled_at || index}`,
      label,
      time: formatScheduledCountdown(diff),
      urgent: diff <= 60000,
      soon: diff > 60000 && diff <= 300000,
    };
  });
}
