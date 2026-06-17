const CAPTCHA_SERVER = "http://localhost:8765";

const FETCH_TIMEOUT = 15000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  return fetch(url, {
    credentials: "include",
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

function apiUrl(serverUrl, path) {
  return `${serverUrl}/api${path}`;
}

chrome.runtime.onConnect.addListener((port) => {
  let responded = false;

  port.onMessage.addListener(async (msg) => {
    const serverUrl = (msg.serverUrl || CAPTCHA_SERVER).replace(/\/+$/, "");
    try {
      let res;

      if (msg.action === "solveCaptcha") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/solve-captcha"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(msg.payload),
        });
      } else if (msg.action === "cancelCaptcha") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/cancel-captcha"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            usage_log_id: msg.payload.usageLogId,
            captcha_id: msg.payload.captchaId,
          }),
        });
      } else if (msg.action === "confirmUsage") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/confirm-usage"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            usage_log_id: msg.payload.usageLogId,
            slot_date: msg.payload.slotDate,
            logs: msg.payload.logs,
          }),
        });
      } else if (msg.action === "failUsage") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/fail-usage"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            usage_log_id: msg.payload.usageLogId,
            error_message: msg.payload.errorMessage,
            error_stage: msg.payload.errorStage,
            slot_date: msg.payload.slotDate,
            logs: msg.payload.logs,
          }),
        });
      } else if (msg.action === "apiKeyStatus") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/api-key-status"), {
          method: "GET",
          headers: {
            Accept: "application/json, text/plain, */*",
          },
        });
      } else if (msg.action === "registerUsage") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/register-usage"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reservation_id: msg.payload.reservationId,
            config_json: msg.payload.configJson,
          }),
        });
      } else if (msg.action === "sharedSlotsClaim") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/slots-group/claim"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            group_key: msg.payload.groupKey,
            client_id: msg.payload.clientId,
            meta: msg.payload.meta,
          }),
        });
      } else if (msg.action === "sharedSlotsWait") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/slots-group/wait"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            group_key: msg.payload.groupKey,
            client_id: msg.payload.clientId,
            wait_ms: msg.payload.waitMs,
          }),
        });
      } else if (msg.action === "sharedSlotsPublish") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/slots-group/publish"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            group_key: msg.payload.groupKey,
            client_id: msg.payload.clientId,
            slots_response: msg.payload.slotsResponse,
          }),
        });
      } else if (msg.action === "sharedSlotsFail") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/slots-group/fail"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            group_key: msg.payload.groupKey,
            client_id: msg.payload.clientId,
            error: msg.payload.error,
          }),
        });
      } else if (msg.action === "sharedSlotsHeartbeat") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/slots-group/heartbeat"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            group_key: msg.payload.groupKey,
            client_id: msg.payload.clientId,
          }),
        });
      } else if (msg.action === "checkStream") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/check-stream"), {
          method: "GET",
          headers: {
            Accept: "application/json, text/plain, */*",
          },
        });
      } else if (msg.action === "openServer") {
        chrome.tabs.create({ url: serverUrl });
        port.postMessage({ ok: true, data: null });
        responded = true;
        port.disconnect();
        return;
      } else if (msg.action === "scheduledEvent") {
        res = await fetchWithTimeout(apiUrl(serverUrl, "/scheduled-event"), {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            label: msg.payload.label,
            scheduled_at: msg.payload.scheduledAt,
            description: msg.payload.description,
          }),
        });
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
