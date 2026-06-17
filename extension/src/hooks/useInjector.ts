import { log } from "@/logger";
import { useCallback, useEffect } from "react";
import { useInjectorStore } from "@/store";
import { main } from "@/api/pipeline";
import { cancelCaptcha, failUsage } from "@/api/background";

let isReporting = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reportFailure(reason: string, stage: string): Promise<boolean> {
  if (isReporting) return false;
  isReporting = true;

  const state = useInjectorStore.getState();
  if (!state.usageLogId) {
    isReporting = false;
    return false;
  }

  const logs = state.logs.map((l) => `${l.ts} ${l.msg}`);
  try {
    await failUsage(
      state.usageLogId,
      reason,
      stage,
      state.config.slotDate,
      logs,
    );
    return true;
  } finally {
    isReporting = false;
  }
}

async function cancelPendingCaptcha(): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = useInjectorStore.getState();
    try {
      if (await cancelCaptcha(current.usageLogId, current.captchaId)) {
        return true;
      }
    } catch {
      // The solve request may not have created the pending session yet.
    }
    await delay(200);
  }
  return false;
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
    useInjectorStore.setState({ abortController });

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
        await cancelPendingCaptcha();
        const reported = await reportFailure("Pipeline stopped by user", "stopped");
        setError(reported ? "Операция остановлена, лог отправлен" : "Операция остановлена, лог не отправлен");
        setStatus("error");
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
