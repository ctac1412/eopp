function log(msg: string, data?: unknown): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[injector ${ts}] ${msg}`, data !== undefined ? data : '');
}

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
