import type { ApiKeyStatusResponse } from '@/types';
import { CAPTCHA_SERVER } from '@/constants';

function getServerUrl(): string {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return window.location.origin;
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

export async function confirmUsage(usageLogId: number, apiKey: string): Promise<boolean> {
  const response = await sendMessageToBackground('confirmUsage', { usageLogId, apiKey });
  return response as boolean;
}

export async function failUsage(usageLogId: number, apiKey: string, errorMessage: string, errorStage: string): Promise<boolean> {
  const response = await sendMessageToBackground('failUsage', { usageLogId, apiKey, errorMessage, errorStage });
  return response as boolean;
}

export async function getApiKeyStatus(apiKey: string): Promise<ApiKeyStatusResponse> {
  const response = await sendMessageToBackground('apiKeyStatus', { apiKey });
  return response as ApiKeyStatusResponse;
}
