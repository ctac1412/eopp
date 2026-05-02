import { log } from '@/logger';

export async function httpRequest(method: string, url: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<unknown> {
  return fetch(url, {
    method,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    if (res.status === 429) {
      return Promise.reject({ status: 429, body: null });
    }
    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch { /* ignore */ }
      return Promise.reject({ status: res.status, body: bodyText });
    }
    return res.json();
  });
}

export async function retryOn429<T>(fn: () => Promise<T>, retries: number, delayMs: number): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const error = err as { status?: number };
      if (error.status === 429 && i < retries) {
        log(`Получен 429, повтор через ${delayMs / 1000}с (попытка ${i + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

export async function retryWith429And400<T>(
  fn: () => Promise<T>,
  retry429: { enabled: boolean; maxRetries: number; delayMs: number },
  retry400: { enabled: boolean; maxRetries: number; delayMs: number },
): Promise<T> {
  let last429Error: unknown;
  let last400Error: unknown;
  let attempts429 = 0;
  let attempts400 = 0;

  const maxTotalAttempts = Math.max(
    retry429.enabled ? retry429.maxRetries + 1 : 1,
    retry400.enabled ? retry400.maxRetries + 1 : 1,
  );

  for (let i = 0; i < maxTotalAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const error = err as { status?: number };
      const status = error.status;

      if (status === 429 && retry429.enabled && attempts429 < retry429.maxRetries) {
        attempts429++;
        last429Error = err;
        log(`Получен 429, повтор через ${retry429.delayMs / 1000}с (429-попытка ${attempts429}/${retry429.maxRetries})`);
        await new Promise((r) => setTimeout(r, retry429.delayMs));
        continue;
      }

      if (status === 400 && retry400.enabled && attempts400 < retry400.maxRetries) {
        attempts400++;
        last400Error = err;
        log(`Получен 400, повтор через ${retry400.delayMs / 1000}с (400-попытка ${attempts400}/${retry400.maxRetries})`);
        await new Promise((r) => setTimeout(r, retry400.delayMs));
        continue;
      }

      throw err;
    }
  }

  throw last429Error || last400Error || new Error('Unreachable');
}
