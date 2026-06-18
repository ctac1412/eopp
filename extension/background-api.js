const FETCH_TIMEOUT = 15000;

function backendFetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  return fetch(url, {
    credentials: "include",
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

function backendUrl(serverUrl, path) {
  return `${serverUrl}/api${path}`;
}

const jsonHeaders = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
};

const acceptHeaders = {
  Accept: "application/json, text/plain, */*",
};

function backendJson(serverUrl, path, body) {
  return backendFetchWithTimeout(backendUrl(serverUrl, path), {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

self.EoppBackend = {
  solveCaptcha: (serverUrl, payload) =>
    backendJson(serverUrl, "/solve-captcha", payload),
  cancelCaptcha: (serverUrl, payload) =>
    backendJson(serverUrl, "/cancel-captcha", {
      usage_log_id: payload.usageLogId,
      captcha_id: payload.captchaId,
    }),
  confirmUsage: (serverUrl, payload) =>
    backendJson(serverUrl, "/confirm-usage", {
      usage_log_id: payload.usageLogId,
      slot_date: payload.slotDate,
      logs: payload.logs,
    }),
  failUsage: (serverUrl, payload) =>
    backendJson(serverUrl, "/fail-usage", {
      usage_log_id: payload.usageLogId,
      error_message: payload.errorMessage,
      error_stage: payload.errorStage,
      slot_date: payload.slotDate,
      logs: payload.logs,
    }),
  apiKeyStatus: (serverUrl) =>
    backendFetchWithTimeout(backendUrl(serverUrl, "/api-key-status"), {
      method: "GET",
      headers: acceptHeaders,
    }),
  registerUsage: (serverUrl, payload) =>
    backendJson(serverUrl, "/register-usage", {
      reservation_id: payload.reservationId,
      config_json: payload.configJson,
    }),
  sharedSlotsClaim: (serverUrl, payload) =>
    backendJson(serverUrl, "/slots-group/claim", {
      group_key: payload.groupKey,
      client_id: payload.clientId,
      meta: payload.meta,
    }),
  sharedSlotsWait: (serverUrl, payload) =>
    backendJson(serverUrl, "/slots-group/wait", {
      group_key: payload.groupKey,
      client_id: payload.clientId,
      wait_ms: payload.waitMs,
    }),
  sharedSlotsPublish: (serverUrl, payload) =>
    backendJson(serverUrl, "/slots-group/publish", {
      group_key: payload.groupKey,
      client_id: payload.clientId,
      slots_response: payload.slotsResponse,
    }),
  sharedSlotsFail: (serverUrl, payload) =>
    backendJson(serverUrl, "/slots-group/fail", {
      group_key: payload.groupKey,
      client_id: payload.clientId,
      error: payload.error,
    }),
  sharedSlotsHeartbeat: (serverUrl, payload) =>
    backendJson(serverUrl, "/slots-group/heartbeat", {
      group_key: payload.groupKey,
      client_id: payload.clientId,
    }),
  checkStream: (serverUrl) =>
    backendFetchWithTimeout(backendUrl(serverUrl, "/check-stream"), {
      method: "GET",
      headers: acceptHeaders,
    }),
  scheduledEvent: (serverUrl, payload) =>
    backendJson(serverUrl, "/scheduled-event", {
      label: payload.label,
      scheduled_at: payload.scheduledAt,
      description: payload.description,
      config_json: payload.configJson,
    }),
};
