import type {
  ChannelCommand,
  ChannelEventBody,
  CommandResultBody,
  OpenSessionBody,
  OpenSessionResponse,
  TransportMode,
} from "@/types";
import { resolveServerUrl } from "@/api/serverUrl";

const SERVER_URL = resolveServerUrl(import.meta.env.VITE_SERVER_URL || "http://localhost:8765");

export interface ChannelTransport {
  mode: TransportMode;
  openSession(body: OpenSessionBody): Promise<OpenSessionResponse>;
  refreshSnapshot(sessionId: string, channelSecret: string, body: OpenSessionBody["raw_snapshot"]): Promise<void>;
  subscribeCommands(
    sessionId: string,
    channelSecret: string,
    onCommands: (commands: ChannelCommand[]) => void,
    onError: (error: Error) => void,
  ): () => void;
  commandResult(sessionId: string, commandId: number, body: CommandResultBody): Promise<void>;
  appendEvent(sessionId: string, body: ChannelEventBody): Promise<void>;
}

export async function createTransport(): Promise<ChannelTransport> {
  const direct = pageDirectTransport();
  try {
    await requestJson(`${SERVER_URL}/health`, { method: "GET" }, 2500);
    return direct;
  } catch {
    return backgroundProxyTransport();
  }
}

function pageDirectTransport(): ChannelTransport {
  return {
    mode: "pageDirect",
    openSession(body) {
      return requestJson<OpenSessionResponse>(`${SERVER_URL}/plugin-channel/sessions/open`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    subscribeCommands(sessionId, channelSecret, onCommands, onError) {
      const params = new URLSearchParams({ channel_secret: channelSecret });
      const source = new EventSource(`${SERVER_URL}/plugin-channel/sessions/${sessionId}/commands/stream?${params.toString()}`);
      source.addEventListener("commands", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { commands?: ChannelCommand[] };
          onCommands(data.commands || []);
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      });
      source.addEventListener("error", (event) => {
        onError(new Error("SSE command stream failed"));
        if ((event as MessageEvent).data) {
          source.close();
        }
      });
      return () => source.close();
    },
    async refreshSnapshot(sessionId, channelSecret, rawSnapshot) {
      await requestJson(`${SERVER_URL}/plugin-channel/sessions/${sessionId}/snapshot`, {
        method: "POST",
        body: JSON.stringify({
          channel_secret: channelSecret,
          route_kind: rawSnapshot.page.route_kind,
          page_url: rawSnapshot.page.url,
          executor_token: rawSnapshot.executor_token || null,
          raw_snapshot: rawSnapshot,
        }),
      });
    },
    async commandResult(sessionId, commandId, body) {
      await requestJson(`${SERVER_URL}/plugin-channel/sessions/${sessionId}/commands/${commandId}/result`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async appendEvent(sessionId, body) {
      await requestJson(`${SERVER_URL}/plugin-channel/sessions/${sessionId}/events`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  };
}

function backgroundProxyTransport(): ChannelTransport {
  return {
    mode: "backgroundProxy",
    openSession(body) {
      return sendBackground<OpenSessionResponse>("openSession", body);
    },
    subscribeCommands(sessionId, channelSecret, onCommands, onError) {
      const port = chrome.runtime.connect({ name: "plugin-channel-sse" });
      port.onMessage.addListener((message) => {
        if (message?.event === "commands") {
          onCommands(message.data?.commands || []);
        } else if (message?.event === "error") {
          onError(new Error(message.error || "Background SSE command stream failed"));
        }
      });
      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          onError(new Error(error.message));
        }
      });
      port.postMessage({ action: "subscribeCommands", payload: { sessionId, channelSecret } });
      return () => port.disconnect();
    },
    async refreshSnapshot(sessionId, channelSecret, rawSnapshot) {
      await sendBackground("refreshSnapshot", {
        sessionId,
        body: {
          channel_secret: channelSecret,
          route_kind: rawSnapshot.page.route_kind,
          page_url: rawSnapshot.page.url,
          executor_token: rawSnapshot.executor_token || null,
          raw_snapshot: rawSnapshot,
        },
      });
    },
    async commandResult(sessionId, commandId, body) {
      await sendBackground("commandResult", { sessionId, commandId, body });
    },
    async appendEvent(sessionId, body) {
      await sendBackground("appendEvent", { sessionId, body });
    },
  };
}

async function requestJson<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function sendBackground<T = unknown>(action: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: "plugin-channel" });
    const timeout = window.setTimeout(() => {
      port.disconnect();
      reject(new Error("Background proxy timeout"));
    }, 15000);

    port.onMessage.addListener((message) => {
      window.clearTimeout(timeout);
      port.disconnect();
      if (message?.ok) {
        resolve(message.data as T);
      } else {
        reject(new Error(message?.error || "Background proxy failed"));
      }
    });

    port.postMessage({ action, payload });
  });
}
