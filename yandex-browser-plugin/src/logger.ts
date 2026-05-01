import { useInjectorStore } from '@/store';

function safeStringify(data: unknown): string {
  if (data instanceof Error) {
    return `${data.name}: ${data.message}`;
  }
  try {
    return JSON.stringify(data, (_, value) => {
      if (value instanceof Error) return `{ ${value.name}: ${value.message} }`;
      return value;
    }, 2);
  } catch {
    return String(data);
  }
}

export function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString().slice(11, 21);
  const fullMsg = data !== undefined ? `${msg} ${safeStringify(data)}` : msg;
  console.log(`[injector ${ts}] ${msg}`, data !== undefined ? data : '');
  useInjectorStore.getState().addLog(fullMsg);
}
