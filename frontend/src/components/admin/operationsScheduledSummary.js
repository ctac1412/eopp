import {
  formatScheduledCountdown,
  getFutureScheduledEvents,
} from "../scheduledEventsState.js";

function fallbackMasterLabel(masterId) {
  return `Master #${masterId}`;
}

function resolveMasterLabel(master) {
  return master?.label || master?.name || fallbackMasterLabel(master?.id ?? "");
}

export function buildOperationsScheduledSummary(events = [], masters = [], now = Date.now()) {
  const masterById = new Map(
    (Array.isArray(masters) ? masters : [])
      .map((master) => [Number(master.id), master])
      .filter(([id]) => Number.isFinite(id)),
  );
  const futureEvents = getFutureScheduledEvents(events, now);
  const groups = new Map();
  let urgent = 0;
  let soon = 0;

  futureEvents.forEach((event) => {
    const masterId = Number(event.api_key_id);
    const groupKey = Number.isFinite(masterId) ? masterId : "unknown";
    const diff = Math.max(0, event.scheduledAt - now);
    if (diff <= 60000) urgent += 1;
    if (diff <= 300000) soon += 1;

    if (!groups.has(groupKey)) {
      const master = masterById.get(masterId);
      groups.set(groupKey, {
        masterId,
        masterLabel: master ? resolveMasterLabel(master) : fallbackMasterLabel(masterId),
        events: [],
      });
    }

    groups.get(groupKey).events.push({
      ...event,
      countdown: formatScheduledCountdown(diff),
      urgent: diff <= 60000,
      soon: diff <= 300000,
    });
  });

  const byMaster = Array.from(groups.values())
    .map((group) => ({
      ...group,
      events: group.events.sort((left, right) => left.scheduledAt - right.scheduledAt),
      nextCountdown: group.events[0]
        ? formatScheduledCountdown(Math.max(0, group.events[0].scheduledAt - now))
        : "",
    }))
    .sort((left, right) => {
      const leftAt = left.events[0]?.scheduledAt ?? Number.MAX_SAFE_INTEGER;
      const rightAt = right.events[0]?.scheduledAt ?? Number.MAX_SAFE_INTEGER;
      return leftAt - rightAt;
    });

  return {
    total: futureEvents.length,
    urgent,
    soon,
    byMaster,
  };
}
