const CAPTCHA_SERVER = "http://localhost:8765";

importScripts("background-api.js");

chrome.runtime.onConnect.addListener((port) => {
  let responded = false;

  port.onMessage.addListener(async (msg) => {
    const serverUrl = (msg.serverUrl || CAPTCHA_SERVER).replace(/\/+$/, "");
    try {
      let res;

      if (msg.action === "solveCaptcha") {
        res = await EoppBackend.solveCaptcha(serverUrl, msg.payload);
      } else if (msg.action === "cancelCaptcha") {
        res = await EoppBackend.cancelCaptcha(serverUrl, msg.payload);
      } else if (msg.action === "confirmUsage") {
        res = await EoppBackend.confirmUsage(serverUrl, msg.payload);
      } else if (msg.action === "failUsage") {
        res = await EoppBackend.failUsage(serverUrl, msg.payload);
      } else if (msg.action === "apiKeyStatus") {
        res = await EoppBackend.apiKeyStatus(serverUrl);
      } else if (msg.action === "registerUsage") {
        res = await EoppBackend.registerUsage(serverUrl, msg.payload);
      } else if (msg.action === "sharedSlotsClaim") {
        res = await EoppBackend.sharedSlotsClaim(serverUrl, msg.payload);
      } else if (msg.action === "sharedSlotsWait") {
        res = await EoppBackend.sharedSlotsWait(serverUrl, msg.payload);
      } else if (msg.action === "sharedSlotsPublish") {
        res = await EoppBackend.sharedSlotsPublish(serverUrl, msg.payload);
      } else if (msg.action === "sharedSlotsFail") {
        res = await EoppBackend.sharedSlotsFail(serverUrl, msg.payload);
      } else if (msg.action === "sharedSlotsHeartbeat") {
        res = await EoppBackend.sharedSlotsHeartbeat(serverUrl, msg.payload);
      } else if (msg.action === "checkStream") {
        res = await EoppBackend.checkStream(serverUrl);
      } else if (msg.action === "openServer") {
        chrome.tabs.create({ url: serverUrl });
        port.postMessage({ ok: true, data: null });
        responded = true;
        port.disconnect();
        return;
      } else if (msg.action === "scheduledEvent") {
        res = await EoppBackend.scheduledEvent(serverUrl, msg.payload);
      } else {
        port.postMessage({ ok: false, error: `Unknown action: ${msg.action}` });
        responded = true;
        port.disconnect();
        return;
      }

      if (!res.ok) {
        const errorText = await res.text();
        port.postMessage({
          ok: false,
          error: { status: res.status, body: errorText },
        });
      } else {
        const json = await res.json();
        port.postMessage({ ok: true, data: json });
      }
    } catch (err) {
      port.postMessage({ ok: false, error: { status: 0, body: err.message } });
    }
    responded = true;
    port.disconnect();
  });

  port.onDisconnect.addListener(() => {
    if (!responded) {
      console.warn("[background] Port disconnected before response");
    }
  });
});
