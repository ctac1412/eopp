import { useInjectorStore } from "@/store";

let usageLogIdPrefix: string = "";

const STAGE_PREFIXES: Record<string, string> = {
  slots: "[1] ",
  captcha: "[2] ",
  solving: "[3] ",
  validating: "[4] ",
  submitting: "[5] ",
};

export function setUsageIdPrefix(id: number | null): void {
  if (id != null) {
    usageLogIdPrefix = `[id=${id}] `;
  } else {
    usageLogIdPrefix = "";
  }
}

function safeStringify(data: unknown): string {
  if (data instanceof Error) {
    return `${data.name}: ${data.message}`;
  }
  try {
    return JSON.stringify(
      data,
      (_, value) => {
        if (value instanceof Error)
          return `{ ${value.name}: ${value.message} }`;
        return value;
      },
      2,
    );
  } catch {
    return String(data);
  }
}

export function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString().slice(11, 21);
  const stage = useInjectorStore.getState().currentStage;
  const stagePrefix = stage && STAGE_PREFIXES[stage] ? STAGE_PREFIXES[stage] : "";
  const fullMsg = data !== undefined ? `${msg} ${safeStringify(data)}` : msg;
  const prefixed = usageLogIdPrefix ? `${usageLogIdPrefix}${stagePrefix}${fullMsg}` : `${stagePrefix}${fullMsg}`;
  console.log(`[injector ${ts}] ${prefixed}`, data !== undefined ? data : "");
  useInjectorStore.getState().addLog(prefixed);
}
