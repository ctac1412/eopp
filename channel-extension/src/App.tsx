import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { collectSnapshot, detectRouteKind } from "@/api/snapshot";
import { createTransport, type ChannelTransport } from "@/api/transport";
import type { ChannelCommand, ChannelLogEntry, ChannelStatus, OpenSessionResponse } from "@/types";

const EXTENSION_VERSION = chrome.runtime?.getManifest?.().version ?? "0.0.0";
const LOG_LIMIT = 80;
const EXECUTOR_TOKEN_KEY = "eopp_channel_executor_token";

export function App() {
  const [status, setStatus] = useState<ChannelStatus>("idle");
  const [transport, setTransport] = useState<ChannelTransport | null>(null);
  const [session, setSession] = useState<OpenSessionResponse | null>(null);
  const [logs, setLogs] = useState<ChannelLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [executorToken, setExecutorToken] = useState(() => window.localStorage.getItem(EXECUTOR_TOKEN_KEY) || "");
  const [wizardVisible, setWizardVisible] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const routeKind = useMemo(() => detectRouteKind(), []);

  const addLog = useCallback((level: ChannelLogEntry["level"], message: string) => {
    setLogs((current) => [{ level, message, at: new Date().toLocaleTimeString() }, ...current].slice(0, LOG_LIMIT));
  }, []);

  const stopCommandStream = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, []);

  const appendEvent = useCallback(
    async (eventType: string, payload: Record<string, unknown>) => {
      if (!transport || !session) return;
      await transport.appendEvent(session.session_id, {
        channel_secret: session.channel_secret,
        event_type: eventType,
        payload,
      });
    },
    [session, transport],
  );

  const resetChannel = useCallback(() => {
    stopCommandStream();
    setStatus("idle");
    setSession(null);
    setTransport(null);
    setWizardVisible(false);
  }, [stopCommandStream]);

  const executeCommand = useCallback(
    async (command: ChannelCommand) => {
      if (!transport || !session) return;

      addLog("info", `Command: ${command.type}`);
      try {
        const result = await runCommand(command, resetChannel, async (snapshot) => {
          snapshot.executor_token = session.executor_token || executorToken.trim() || null;
          await transport.refreshSnapshot(session.session_id, session.channel_secret, snapshot);
        });
        await transport.commandResult(session.session_id, command.id, {
          channel_secret: session.channel_secret,
          ok: true,
          result,
        });
      } catch (commandError) {
        const message = commandError instanceof Error ? commandError.message : String(commandError);
        addLog("error", `Command ${command.type} failed: ${message}`);
        await transport.commandResult(session.session_id, command.id, {
          channel_secret: session.channel_secret,
          ok: false,
          error: message,
        });
      }
    },
    [addLog, executorToken, resetChannel, session, transport],
  );

  useEffect(() => {
    if (!transport || !session || status !== "open") return;

    unsubscribeRef.current = transport.subscribeCommands(
      session.session_id,
      session.channel_secret,
      (commands) => {
        for (const command of commands) void executeCommand(command);
      },
      (streamError) => addLog("warn", streamError.message),
    );
    addLog("info", "SSE command stream opened");

    return stopCommandStream;
  }, [addLog, executeCommand, session, status, stopCommandStream, transport]);

  const openChannel = useCallback(async () => {
    setWizardVisible(true);
    setStatus("opening");
    setError(null);
    addLog("info", "Opening channel");

    try {
      const selectedTransport = await createTransport();
      setTransport(selectedTransport);
      addLog("info", `Transport: ${selectedTransport.mode}`);

      const installationId = await getInstallationId();
      const normalizedExecutorToken = executorToken.trim();
      window.localStorage.setItem(EXECUTOR_TOKEN_KEY, normalizedExecutorToken);

      const rawSnapshot = collectSnapshot();
      rawSnapshot.executor_token = normalizedExecutorToken || null;

      const opened = await selectedTransport.openSession({
        installation_id: installationId,
        extension_version: EXTENSION_VERSION,
        route_kind: rawSnapshot.page.route_kind,
        page_url: window.location.href,
        transport_mode: selectedTransport.mode,
        executor_token: normalizedExecutorToken || null,
        raw_snapshot: rawSnapshot,
      });
      setSession(opened);
      setStatus("open");
      addLog("info", `Session opened: ${opened.session_id}`);
    } catch (openError) {
      const message = openError instanceof Error ? openError.message : String(openError);
      setStatus("error");
      setError(message);
      addLog("error", message);
    }
  }, [addLog, executorToken]);

  const closeChannel = useCallback(async () => {
    try {
      await appendEvent("channel.closed_by_client", { page_url: window.location.href });
    } catch {
      // Closing must remain local even when the server is already unreachable.
    }
    addLog("info", "Channel closed");
    resetChannel();
  }, [addLog, appendEvent, resetChannel]);

  return (
    <>
      <button
        className="eopp-channel-button"
        type="button"
        onClick={() => setWizardVisible(true)}
        disabled={status === "opening" || status === "open"}
      >
        Подключиться
      </button>

      {(wizardVisible || status !== "idle") && (
        <div className="eopp-channel-backdrop" role="dialog" aria-modal="true" aria-live="polite">
          <section className="eopp-channel-panel">
            <header>
              <div>
                <strong>Подключение канала</strong>
                <span>{statusLabel(status)}</span>
              </div>
              <button type="button" onClick={closeChannel}>
                Закрыть
              </button>
            </header>

            {status !== "open" && (
              <div className="eopp-channel-wizard">
                <label>
                  <span>Токен исполнителя</span>
                  <input
                    value={executorToken}
                    onChange={(event) => setExecutorToken(event.target.value)}
                    placeholder="Например: master-ivanov / job-token"
                    disabled={status === "opening"}
                  />
                </label>
                <button className="eopp-channel-connect" type="button" onClick={openChannel} disabled={status === "opening"}>
                  {status === "opening" ? "Подключение..." : "Подключиться"}
                </button>
              </div>
            )}

            <dl>
              <div>
                <dt>Маршрут</dt>
                <dd>{session?.route_kind ?? routeKind}</dd>
              </div>
              <div>
                <dt>Транспорт</dt>
                <dd>{transport?.mode ?? "-"}</dd>
              </div>
              <div>
                <dt>Исполнитель</dt>
                <dd>{session?.executor_token || executorToken || "-"}</dd>
              </div>
              <div>
                <dt>Компания</dt>
                <dd>{companyLabel(session)}</dd>
              </div>
              <div>
                <dt>Пользователь</dt>
                <dd>{userLabel(session)}</dd>
              </div>
              <div>
                <dt>Видимость</dt>
                <dd>{session?.visibility || "-"}</dd>
              </div>
            </dl>

            {error && <p className="eopp-channel-error">{error}</p>}

            <div className="eopp-channel-actions">
              <button type="button" onClick={() => void appendEvent("channel.stop_requested", { page_url: window.location.href })}>
                Стоп
              </button>
              <button type="button" onClick={closeChannel}>
                Закрыть
              </button>
            </div>

            <ol className="eopp-channel-logs">
              {logs.map((log, index) => (
                <li key={`${log.at}-${index}`} data-level={log.level}>
                  <time>{log.at}</time>
                  <span>{log.message}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}

async function runCommand(
  command: ChannelCommand,
  resetChannel: () => void,
  refreshSnapshot: (snapshot: ReturnType<typeof collectSnapshot>) => Promise<void>,
): Promise<Record<string, unknown>> {
  switch (command.type) {
    case "refresh_snapshot": {
      const snapshot = collectSnapshot();
      await refreshSnapshot(snapshot);
      return { refreshed: true, captured_at: snapshot.captured_at };
    }
    case "navigate_to_reservation": {
      const reservationId = String(command.payload.reservation_id || "");
      if (!reservationId) throw new Error("reservation_id is required");
      window.location.href = `/reservations/${encodeURIComponent(reservationId)}`;
      return { navigated: true, reservation_id: reservationId };
    }
    case "apply_config":
      return { applied: true, config_keys: Object.keys(command.payload || {}) };
    case "start_pipeline":
      return { accepted: false, reason: "pipeline_not_embedded_in_channel_agent" };
    case "stop_pipeline":
      return { stopped: true };
    case "close_channel":
      resetChannel();
      return { closed: true };
    default:
      throw new Error(`Unsupported command: ${command.type}`);
  }
}

async function getInstallationId(): Promise<string> {
  const key = "eopp_channel_installation_id";
  const existing = await chromeStorageGet(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  await chromeStorageSet(key, created);
  return created;
}

function chromeStorageGet(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!chrome.storage?.local?.get) {
      resolve(window.localStorage.getItem(key));
      return;
    }
    chrome.storage.local.get(key, (result) => resolve((result?.[key] as string | undefined) ?? null));
  });
}

function chromeStorageSet(key: string, value: string): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.storage?.local?.set) {
      window.localStorage.setItem(key, value);
      resolve();
      return;
    }
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

function statusLabel(status: ChannelStatus): string {
  const labels: Record<ChannelStatus, string> = {
    idle: "ожидает",
    opening: "подключается",
    open: "подключен",
    error: "ошибка",
    closed: "закрыт",
  };
  return labels[status];
}

function companyLabel(session: OpenSessionResponse | null): string {
  if (!session?.company?.name) return "-";
  return session.company.auto_created ? `${session.company.name} (auto-created)` : session.company.name;
}

function userLabel(session: OpenSessionResponse | null): string {
  if (!session?.eopp_user) return "-";
  if (typeof session.eopp_user === "string") return session.eopp_user;
  return session.eopp_user.name || "-";
}
