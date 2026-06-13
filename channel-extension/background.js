const CHANNEL_SERVER = "http://localhost:8765";
const FETCH_TIMEOUT = 15000;

function serverBase(raw) {
  return (raw || CHANNEL_SERVER).replace(/\/+$/, "");
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId),
  );
}

async function requestJson(method, path, body, serverUrl) {
  const res = await fetchWithTimeout(`${serverBase(serverUrl)}${path}`, {
    method,
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw { status: res.status, body: data };
  }
  return data;
}

chrome.runtime.onConnect.addListener((port) => {
  let responded = false;
  let streamAbort = null;

  port.onMessage.addListener(async (msg) => {
    try {
      const serverUrl = msg.serverUrl || CHANNEL_SERVER;
      let data;
      if (msg.action === "openSession") {
        data = await requestJson("POST", "/plugin-channel/sessions/open", msg.payload, serverUrl);
      } else if (msg.action === "subscribeCommands") {
        const { sessionId, channelSecret } = msg.payload;
        responded = true;
        streamAbort = subscribeCommands(
          port,
          `${serverBase(serverUrl)}/plugin-channel/sessions/${encodeURIComponent(sessionId)}/commands/stream?channel_secret=${encodeURIComponent(channelSecret)}`,
        );
        return;
      } else if (msg.action === "refreshSnapshot") {
        const { sessionId, body } = msg.payload;
        data = await requestJson(
          "POST",
          `/plugin-channel/sessions/${encodeURIComponent(sessionId)}/snapshot`,
          body,
          serverUrl,
        );
      } else if (msg.action === "commandResult") {
        const { sessionId, commandId, body } = msg.payload;
        data = await requestJson(
          "POST",
          `/plugin-channel/sessions/${encodeURIComponent(sessionId)}/commands/${encodeURIComponent(commandId)}/result`,
          body,
          serverUrl,
        );
      } else if (msg.action === "appendEvent") {
        const { sessionId, body } = msg.payload;
        data = await requestJson(
          "POST",
          `/plugin-channel/sessions/${encodeURIComponent(sessionId)}/events`,
          body,
          serverUrl,
        );
      } else {
        throw { status: 400, body: { error: `Unknown action: ${msg.action}` } };
      }
      port.postMessage({ ok: true, data });
    } catch (error) {
      port.postMessage({ ok: false, error });
    }
    responded = true;
    port.disconnect();
  });

  port.onDisconnect.addListener(() => {
    if (streamAbort) {
      streamAbort.abort();
      streamAbort = null;
    }
    if (!responded) {
      console.warn("[channel-background] Port disconnected before response");
    }
  });
});

function subscribeCommands(port, url) {
  const controller = new AbortController();
  readSseStream(port, url, controller.signal).catch((error) => {
    if (!controller.signal.aborted) {
      port.postMessage({ event: "error", error: error?.message || String(error) });
    }
  });
  return controller;
}

async function readSseStream(port, url, signal) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`SSE HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (event.event === "commands") {
        port.postMessage({ event: "commands", data: JSON.parse(event.data || "{}") });
      } else if (event.event === "error") {
        port.postMessage({ event: "error", error: event.data || "SSE command stream failed" });
      }
    }
  }
}

function parseSseChunk(chunk) {
  const event = { event: "message", data: "" };
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) {
      event.event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      event.data += line.slice(5).trim();
    }
  }
  return event;
}
