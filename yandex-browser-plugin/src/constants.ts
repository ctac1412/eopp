import {
  Facility,
  PageInfo,
  InjectorConfig,
  RetryConfig,
  EndpointName,
} from "@/types";

export const FACILITIES: Facility[] = [
  { id: "1dae5b1c-e2b3-44a4-848f-df8ce2ddde42", name: "АПП Забайкальск" },
  {
    id: "93c9939a-2182-4e78-98b4-0cf314b09cfa",
    name: "АПП Тагиркент-Казмаляр",
  },
  { id: "cbde069a-7e18-4ca6-9b38-f790348d6c24", name: "АПП Бугристое" },
  { id: "1fffb312-4ebe-4ad2-a356-0b8f04587c11", name: "АПП Верхний Ларс" },
  { id: "ab6edb80-5f8f-4bf9-bf9a-a925271d9df8", name: "АПП Чернышевское" },
];

export const TZ_OFFSET = 3;
export const CAPTCHA_SERVER =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_SERVER_URL) ||
  "http://localhost:8765";
export const SERVER_HOST =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_SERVER_HOST) ||
  "localhost";
export const EOPP_API_BASE = "https://eopp.epd-portal.ru/reservations-api/v1";

export function shouldInject(pageUrl: string): PageInfo | null {
  const match = pageUrl.match(
    /\/reservations\/reservation\/([a-f0-9-]{36})\/(edit|reschedule)/,
  );
  if (match) {
    return {
      reservationId: match[1],
      pageType: match[2] as "edit" | "reschedule",
    };
  }
  const testMatch = pageUrl.match(/\/test-injector\/(edit|reschedule)/);
  if (testMatch) {
    return {
      reservationId: "00000000-0000-0000-0000-000000000000",
      isLocalhost: true,
      pageType: testMatch[1] as "edit" | "reschedule",
    };
  }
  if (
    pageUrl.startsWith("http://localhost:8765") ||
    pageUrl.startsWith("http://127.0.0.1:8765") ||
    pageUrl.startsWith("https://localhost:8765") ||
    pageUrl.startsWith("https://127.0.0.1:8765") ||
    pageUrl.startsWith("http://127.0.0.1:8766") ||
    pageUrl.startsWith("https://127.0.0.1:8766") ||
    pageUrl.startsWith(`http://${SERVER_HOST}`) ||
    pageUrl.startsWith(`https://${SERVER_HOST}`)
  ) {
    return {
      reservationId: "00000000-0000-0000-0000-000000000000",
      isLocalhost: true,
    };
  }
  return null;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function defaultRetryConfig(): RetryConfig {
  return {
    enabled: true,
    maxRetries: 5,
    delayMs: 3000,
    retry400Enabled: false,
    retry400MaxRetries: 0,
    retry400DelayMs: 0,
  };
}

function defaultSlotsRetryConfig(): RetryConfig {
  return {
    enabled: true,
    maxRetries: 5,
    delayMs: 3000,
    retry400Enabled: true,
    retry400MaxRetries: 15,
    retry400DelayMs: 1000,
  };
}

export function createDefaultConfig(
  reservationId: string,
  facilityId: string,
  vehicleId: string,
  transportType: 1 | 2,
  mode: "reschedule" | "create" = "reschedule",
): InjectorConfig {
  return {
    runUpTo: 5,
    facilityId,
    vehicleId,
    reservationId,
    transportType,
    slotDate: getDefaultSlotDate(mode),
    mode,
    timeOrder: [[]],
    preferredMode: "soft",
    autoSolve: false,
    retryOnAllSlotsOccupied: true,
    maxSlotRetries: 8,
    slotRetryDelayMs: 500,
    retryPerEndpoint: {
      getAvailableSlots: defaultSlotsRetryConfig(),
      generateCaptcha: defaultRetryConfig(),
      validateCaptcha: defaultRetryConfig(),
      submitReschedule: defaultRetryConfig(),
      submitCreate: defaultRetryConfig(),
    },
    apiKey: "",
    maxRetries: 5,
    retryDelayMs: 3000,
    reservationData: null,
  };
}

export function getDefaultSlotDate(mode: "reschedule" | "create"): string {
  return mode === "reschedule" ? addDays(1) : addDays(13);
}

export function loadSavedConfig(
  reservationId: string,
): Partial<InjectorConfig> | null {
  try {
    const raw = localStorage.getItem(`_c_${reservationId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveConfig(
  reservationId: string,
  config: InjectorConfig,
): void {
  try {
    localStorage.setItem(
      `_c_${reservationId}`,
      JSON.stringify(config),
    );
  } catch {
    /* quota exceeded, ignore */
  }
}

export function getEndpointRetry(
  config: InjectorConfig,
  endpoint: EndpointName,
): RetryConfig {
  if (config.retryPerEndpoint && config.retryPerEndpoint[endpoint]) {
    return config.retryPerEndpoint[endpoint];
  }
  return {
    enabled: true,
    maxRetries: config.maxRetries ?? 5,
    delayMs: config.retryDelayMs ?? 3000,
    retry400Enabled: false,
    retry400MaxRetries: 0,
    retry400DelayMs: 0,
  };
}
