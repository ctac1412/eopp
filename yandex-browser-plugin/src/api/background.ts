export function sendMessageToBackground(action: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: `${action}-${Date.now()}` });
    port.postMessage({ action, payload });
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
