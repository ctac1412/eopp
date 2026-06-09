const CAPTCHA_SERVER = "http://localhost:8765";

chrome.runtime.onConnect.addListener((port) => {
  let responded = false;

  port.onMessage.addListener(async (msg) => {
    const serverUrl = (msg.serverUrl || CAPTCHA_SERVER).replace(/\/+$/, "");
    try {
      let res;

      if (msg.action === "solveCaptcha") {
        res = await fetch(`${serverUrl}/solve-captcha`, {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(msg.payload),
        });
      } else if (msg.action === "confirmUsage") {
        res = await fetch(`${serverUrl}/confirm-usage`, {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            usage_log_id: msg.payload.usageLogId,
            api_key: msg.payload.apiKey,
            slot_date: msg.payload.slotDate,
            logs: msg.payload.logs,
          }),
        });
      } else if (msg.action === "failUsage") {
        res = await fetch(`${serverUrl}/fail-usage`, {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            usage_log_id: msg.payload.usageLogId,
            api_key: msg.payload.apiKey,
            error_message: msg.payload.errorMessage,
            error_stage: msg.payload.errorStage,
            slot_date: msg.payload.slotDate,
            logs: msg.payload.logs,
          }),
        });
      } else if (msg.action === "apiKeyStatus") {
        res = await fetch(
          `${serverUrl}/api-key-status?key=${encodeURIComponent(msg.payload.apiKey)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json, text/plain, */*",
            },
          },
        );
      } else if (msg.action === "registerUsage") {
        res = await fetch(`${serverUrl}/register-usage`, {
          method: "POST",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: msg.payload.apiKey,
            reservation_id: msg.payload.reservationId,
            config_json: msg.payload.configJson,
          }),
        });
      } else if (msg.action === "sharedSlotsClaim") {
        res = await fetch(`${serverUrl}/slots-group/claim`, {
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
        res = await fetch(`${serverUrl}/slots-group/wait`, {
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
        res = await fetch(`${serverUrl}/slots-group/publish`, {
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
        res = await fetch(`${serverUrl}/slots-group/fail`, {
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
        res = await fetch(`${serverUrl}/slots-group/heartbeat`, {
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
        res = await fetch(
          `${serverUrl}/check-stream?api_key=${encodeURIComponent(msg.payload.apiKey)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json, text/plain, */*",
            },
          },
        );
      } else if (msg.action === "openServer") {
        chrome.tabs.create({ url: serverUrl });
        port.postMessage({ ok: true, data: null });
        responded = true;
        port.disconnect();
        return;
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
