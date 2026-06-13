import type { RawSnapshot, RouteKind } from "@/types";

const TEXT_LIMIT = 8000;
const FIELD_LIMIT = 80;

export function detectRouteKind(url = window.location.href): RouteKind {
  const hinted = document.body?.dataset.routeKind;
  if (hinted === "reservation_card" || hinted === "eopp_root" || hinted === "unknown") {
    return hinted;
  }

  const parsed = safeUrl(url);
  if (!parsed) {
    return "unknown";
  }

  if (parsed.pathname.toLowerCase().includes("reservation")) {
    return "reservation_card";
  }

  if (parsed.hostname.includes("eopp.epd-portal.ru")) {
    return "eopp_root";
  }

  return "unknown";
}

export function getReservationId(url = window.location.href): string | null {
  const hinted = document.body?.dataset.reservationId;
  if (hinted) {
    return hinted;
  }

  const parsed = safeUrl(url);
  if (!parsed) {
    return null;
  }

  const fromQuery =
    parsed.searchParams.get("reservationId") ||
    parsed.searchParams.get("reservation_id") ||
    parsed.searchParams.get("id");
  if (fromQuery) {
    return fromQuery;
  }

  const match = parsed.pathname.match(/(?:reservation|reservations|booking|draft)[^0-9a-f-]*([0-9a-f-]{6,})/i);
  return match?.[1] ?? null;
}

export function collectSnapshot(): RawSnapshot {
  const routeKind = detectRouteKind();
  const bodyText = document.body?.innerText ?? "";
  const visibleText = bodyText.replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);

  return {
    captured_at: new Date().toISOString(),
    page: {
      url: window.location.href,
      title: document.title,
      route_kind: routeKind,
    },
    reservation: {
      id: getReservationId(),
      userData: {
        organizationName: readCompanyHint(),
        fio: document.body?.dataset.eoppUser || findUserHint(visibleText),
      },
    },
    dom: {
      visible_text: visibleText,
      headings: collectText("h1,h2,h3,[role='heading']", 20),
      labels: collectText("label,.ant-form-item-label,.form-label", 40),
      inputs: collectInputs(),
    },
    storage_hints: collectStorageHints(),
    eopp_user_hint: findUserHint(visibleText),
  };
}

function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function collectText(selector: string, limit: number): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .map((element) => element.innerText?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit) as string[];
}

function collectInputs(): RawSnapshot["dom"]["inputs"] {
  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select"))
    .slice(0, FIELD_LIMIT)
    .map((element) => ({
      name: element.getAttribute("name") ?? undefined,
      id: element.id || undefined,
      value: readableValue(element.value),
      placeholder: element.getAttribute("placeholder") ?? undefined,
    }));
}

function collectStorageHints(): RawSnapshot["storage_hints"] {
  return {
    local_storage_keys: storageKeys(window.localStorage),
    session_storage_keys: storageKeys(window.sessionStorage),
  };
}

function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length && keys.length < 50; index += 1) {
    const key = storage.key(index);
    if (key) {
      keys.push(key);
    }
  }
  return keys;
}

function readableValue(value: string): string | undefined {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 120) {
    return undefined;
  }
  return trimmed;
}

function findUserHint(visibleText: string): string | null {
  const match = visibleText.match(/(?:пользователь|оператор|user)\s*:?\s*([А-ЯA-ZЁ][^|,;]{3,80})/i);
  return match?.[1]?.trim() ?? null;
}

function readCompanyHint(): string | null {
  const element = document.querySelector<HTMLElement>("[data-company-name]");
  return element?.innerText?.replace(/\s+/g, " ").trim() || null;
}
