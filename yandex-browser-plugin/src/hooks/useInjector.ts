import { log } from "@/logger";
import { useCallback, useEffect } from "react";
import { useInjectorStore } from "@/store";
import { main } from "@/api/pipeline";
import { failUsage } from "@/api/background";

let isReporting = false;

async function reportFailure(reason: string, stage: string) {
  if (isReporting) return;
  isReporting = true;

  const state = useInjectorStore.getState();
  if (!state.usageLogId || !state.config.apiKey) {
    isReporting = false;
    return;
  }

  const logs = state.logs.map((l) => `${l.ts} ${l.msg}`);
  await failUsage(
    state.usageLogId,
    state.config.apiKey,
    reason,
    stage,
    state.config.slotDate,
    logs,
    state.captchaId ?? undefined,
  );
  isReporting = false;
}

export function useInjector() {
  const setStatus = useInjectorStore((s) => s.setStatus);
  const setError = useInjectorStore((s) => s.setError);
  const setResult = useInjectorStore((s) => s.setResult);
  const clearLogs = useInjectorStore((s) => s.clearLogs);
  const setStage = useInjectorStore((s) => s.setStage);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (useInjectorStore.getState().status === "running") {
        reportFailure("Page refreshed during pipeline", "page_refresh");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const run = useCallback(async () => {
    isReporting = false;
    const config = useInjectorStore.getState().config;
    const abortController = new AbortController();
    useInjectorStore.getState().abortController = abortController;

    setStatus("running");
    setError(null);
    setResult(null);
    clearLogs();
    setStage(null);

    try {
      await main(config, abortController.signal);
      setStatus("done");
      setStage(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        log("=== Остановлено пользователем ===");
        await reportFailure("Pipeline stopped by user", "stopped");
        setError("Остановлено пользователем");
        setStatus("idle");
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
      }
      setStage(null);
    }
  }, [setStatus, setError, setResult, clearLogs, setStage]);

  return { run };
}
