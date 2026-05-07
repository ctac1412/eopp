const CAPTCHA_SERVER = "https://china.alabai.netcraze.pro";

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
            captcha_id: msg.payload.captchaId,
            valid_variant_index: msg.payload.validVariantIndex,
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
            captcha_id: msg.payload.captchaId,
            valid_variant_index: msg.payload.validVariantIndex,
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
