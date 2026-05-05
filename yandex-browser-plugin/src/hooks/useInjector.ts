import { useCallback } from "react";
import { useInjectorStore } from "@/store";
import { main } from "@/api/pipeline";

export function useInjector() {
  const setStatus = useInjectorStore((s) => s.setStatus);
  const setError = useInjectorStore((s) => s.setError);
  const setResult = useInjectorStore((s) => s.setResult);
  const clearLogs = useInjectorStore((s) => s.clearLogs);
  const setStage = useInjectorStore((s) => s.setStage);

  const run = useCallback(async () => {
    const config = useInjectorStore.getState().config;
    setStatus("running");
    setError(null);
    setResult(null);
    clearLogs();
    setStage(null);
    try {
      await main(config);
      setStatus("done");
      setStage(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
      setStage(null);
    }
  }, [setStatus, setError, setResult, clearLogs, setStage]);

  return { run };
}
