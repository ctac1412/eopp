import type { ApiKeyStatusResponse, InjectorConfig, SlotsGroupAssignment, SlotDict, SlotsGroupPollResponse, SlotsGroupHeartbeatResponse } from '@/types';
import { CAPTCHA_SERVER } from '@/constants';

export function getServerUrl(): string {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://127.0.0.1:${window.location.port || '8765'}`;
  }
  return CAPTCHA_SERVER;
}

export function sendMessageToBackground(action: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: `${action}-${Date.now()}` });
    port.postMessage({ action, payload, serverUrl: getServerUrl() });
    let responded = false;

    port.onMessage.addListener((response: { ok?: boolean; data?: unknown; error?: string }) => {
      responded = true;
      port.disconnect();
      if (response && response.ok) {
        resolve(response.data);
      } else {
        reject(response ? response.error : new Error('No response'));
      }
    });

    port.onDisconnect.addListener(() => {
      if (!responded) {
        reject(new Error('Connection closed before response'));
      }
    });
  });
}

export async function confirmUsage(usageLogId: number, apiKey: string, slotDate?: string, logs?: string[], captchaId?: string, validVariantIndex?: number): Promise<boolean> {
  const response = await sendMessageToBackground('confirmUsage', { usageLogId, apiKey, slotDate, logs, captchaId, validVariantIndex });
  return response as boolean;
}

export async function failUsage(usageLogId: number, apiKey: string, errorMessage: string, errorStage: string, slotDate?: string, logs?: string[], captchaId?: string, validVariantIndex?: number): Promise<boolean> {
  const response = await sendMessageToBackground('failUsage', { usageLogId, apiKey, errorMessage, errorStage, slotDate, logs, captchaId, validVariantIndex });
  return response as boolean;
}

export async function getApiKeyStatus(apiKey: string): Promise<ApiKeyStatusResponse> {
  const response = await sendMessageToBackground('apiKeyStatus', { apiKey });
  return response as ApiKeyStatusResponse;
}

function sanitizeConfig(config: InjectorConfig): Record<string, unknown> {
  const c = { ...config };
  delete (c as any).apiKey;
  return c;
}

export async function registerUsage(apiKey: string, reservationId: string, config?: InjectorConfig): Promise<number | SlotsGroupAssignment> {
  const response = await sendMessageToBackground('registerUsage', {
    apiKey,
    reservationId,
    configJson: config ? sanitizeConfig(config) : undefined,
  });
  const data = response as { usage_log_id?: number; group_id?: string };
  if (data.group_id !== undefined) {
    return data as SlotsGroupAssignment;
  }
  return data.usage_log_id as number;
}

export async function pollSlotsGroup(groupId: string, consumerId: number): Promise<SlotsGroupPollResponse> {
  const response = await sendMessageToBackground('pollSlotsGroup', { groupId, consumerId });
  return response as SlotsGroupPollResponse;
}

export async function heartbeatSlotsGroup(groupId: string, consumerId: number, apiKey: string, slots?: SlotDict[]): Promise<SlotsGroupHeartbeatResponse> {
  const response = await sendMessageToBackground('heartbeatSlotsGroup', { groupId, consumerId, apiKey, slots: slots || [] });
  return response as SlotsGroupHeartbeatResponse;
}
