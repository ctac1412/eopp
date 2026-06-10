import type {
  ApiKeyStatusResponse,
  InjectorConfig,
  SharedSlotsClaimResponse,
  SlotsResponse,
} from "@/types";
import {
  CAPTCHA_SERVER,
  LOCAL_CAPTCHA_SERVER,
  getDefaultScheduleTime,
  isLocalServerEnabled,
} from "@/constants";

export { getDefaultScheduleTime };

export function getServerUrl(): string {
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return `http://127.0.0.1:${window.location.port || "8765"}`;
  }
  return isLocalServerEnabled() ? LOCAL_CAPTCHA_SERVER : CAPTCHA_SERVER;
}

export function sendMessageToBackground(
  action: string,
  payload: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: `${action}-${Date.now()}` });
    port.postMessage({ action, payload, serverUrl: getServerUrl() });
    let responded = false;

    port.onMessage.addListener(
      (response: { ok?: boolean; data?: unknown; error?: string }) => {
        responded = true;
        port.disconnect();
        if (response && response.ok) {
          resolve(response.data);
        } else {
          reject(response ? response.error : new Error("No response"));
        }
      },
    );

    port.onDisconnect.addListener(() => {
      if (!responded) {
        reject(new Error("Connection closed before response"));
      }
    });
  });
}

export async function confirmUsage(
  usageLogId: number,
  apiKey: string,
  slotDate?: string,
  logs?: string[],
): Promise<boolean> {
  const response = await sendMessageToBackground("confirmUsage", {
    usageLogId,
    apiKey,
    slotDate,
    logs,
  });
  return response as boolean;
}

export async function failUsage(
  usageLogId: number,
  apiKey: string,
  errorMessage: string,
  errorStage: string,
  slotDate?: string,
  logs?: string[],
): Promise<boolean> {
  const response = await sendMessageToBackground("failUsage", {
    usageLogId,
    apiKey,
    errorMessage,
    errorStage,
    slotDate,
    logs,
  });
  return response as boolean;
}

export async function getApiKeyStatus(
  apiKey: string,
): Promise<ApiKeyStatusResponse> {
  const response = await sendMessageToBackground("apiKeyStatus", { apiKey });
  return response as ApiKeyStatusResponse;
}

export async function checkStream(apiKey: string): Promise<{ valid: boolean; has_active_stream: boolean }> {
  const response = await sendMessageToBackground("checkStream", { apiKey });
  return response as { valid: boolean; has_active_stream: boolean };
}

export async function openServerUrl(): Promise<void> {
  await sendMessageToBackground("openServer", {});
}

function sanitizeConfig(config: InjectorConfig): Record<string, unknown> {
  const c = { ...config };
  delete (c as any).apiKey;
  const host = window.location.hostname.toLowerCase();
  (c as any).captcha_source = host === "eopp.epd-portal.ru" ? "eopp" : "local";
  return c;
}

export async function registerUsage(
  apiKey: string,
  reservationId: string,
  config?: InjectorConfig,
): Promise<number> {
  try {
    const response = await sendMessageToBackground("registerUsage", {
      apiKey,
      reservationId,
      configJson: config ? sanitizeConfig(config) : undefined,
    });
    const data = response as { usage_log_id?: number };
    return data.usage_log_id as number;
  } catch (err) {
    const error = err as { status?: number; body?: string };
    if (error.status === 412) {
      try {
        const parsed = JSON.parse(error.body || "{}");
        throw new Error(parsed.message || "Требуется активное SSE-подключение");
      } catch {
        throw new Error("Откройте страницу с капчами и авторизуйтесь");
      }
    }
    throw err;
  }
}

export async function claimSharedSlots(
  groupKey: string,
  clientId: string,
  meta?: Record<string, unknown>,
): Promise<SharedSlotsClaimResponse> {
  const response = await sendMessageToBackground("sharedSlotsClaim", {
    groupKey,
    clientId,
    meta,
  });
  return response as SharedSlotsClaimResponse;
}

export async function waitSharedSlots(
  groupKey: string,
  clientId: string,
  waitMs: number,
): Promise<SharedSlotsClaimResponse> {
  const response = await sendMessageToBackground("sharedSlotsWait", {
    groupKey,
    clientId,
    waitMs,
  });
  return response as SharedSlotsClaimResponse;
}

export async function publishSharedSlots(
  groupKey: string,
  clientId: string,
  slotsResponse: SlotsResponse,
): Promise<SharedSlotsClaimResponse> {
  const response = await sendMessageToBackground("sharedSlotsPublish", {
    groupKey,
    clientId,
    slotsResponse,
  });
  return response as SharedSlotsClaimResponse;
}

export async function heartbeatSharedSlots(
  groupKey: string,
  clientId: string,
): Promise<SharedSlotsClaimResponse> {
  const response = await sendMessageToBackground("sharedSlotsHeartbeat", {
    groupKey,
    clientId,
  });
  return response as SharedSlotsClaimResponse;
}

export async function failSharedSlots(
  groupKey: string,
  clientId: string,
  error: string,
): Promise<SharedSlotsClaimResponse> {
  const response = await sendMessageToBackground("sharedSlotsFail", {
    groupKey,
    clientId,
    error,
  });
  return response as SharedSlotsClaimResponse;
}

export async function sendScheduledEvent(
  apiKeyId: string,
  label: string,
  scheduledAt: string,
  description: string,
): Promise<{ ok: boolean; delivered_to_operators: number }> {
  const response = await sendMessageToBackground("scheduledEvent", {
    apiKeyId,
    label,
    scheduledAt,
    description,
  });
  return response as { ok: boolean; delivered_to_operators: number };
}
