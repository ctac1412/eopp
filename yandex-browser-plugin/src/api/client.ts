import { log } from "@/logger";

function getCookie(name: string): string | null {
  const prefix = `${name}=`;
  const item = document.cookie
    .split("; ")
    .find((row) => row.startsWith(prefix));
  if (!item) return null;
  return item.slice(prefix.length);
}

function getFacilityModeHeader(): string {
  return localStorage.getItem("encryptedSettings") ? "true" : "false";
}

export function getEoppHeaders(
  hasJsonBody: boolean,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ru,en;q=0.9",
    FacilityMode: getFacilityModeHeader(),
    "User-Local-Time": new Date().toISOString(),
  };

  if (hasJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  const xsrfToken = getCookie("XSRF-TOKEN");
  if (xsrfToken) {
    headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrfToken);
  }

  return {
    ...headers,
    ...extraHeaders,
  };
}

export function eoppFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const hasJsonBody = init.body !== undefined;
  const extraHeaders = Object.fromEntries(
    new Headers(init.headers).entries(),
  ) as Record<string, string>;

  return fetch(url, {
    ...init,
    headers: getEoppHeaders(hasJsonBody, extraHeaders),
    credentials: "include",
    mode: init.mode ?? "cors",
  });
}

export async function httpRequest(
  method: string,
  url: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  return eoppFetch(url, {
    method,
    headers: extraHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  }).then(async (res) => {
    if (res.status === 429) {
      return Promise.reject({ status: 429, body: null });
    }
    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        /* ignore */
      }
      return Promise.reject({ status: res.status, body: bodyText });
    }
    return res.json();
  });
}

function abortError(): DOMException {
  return new DOMException("Pipeline stopped by user", "AbortError");
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function retryOn429<T>(
  fn: () => Promise<T>,
  retries: number,
  delayMs: number,
  label: string = "",
  signal?: AbortSignal,
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    checkAbort(signal);
    try {
      return await fn();
    } catch (err) {
      checkAbort(signal);
      const error = err as { status?: number };
      if (error.status === 429 && i < retries) {
        const lbl = label ? ` [${label}]` : "";
        log(
          `Получен 429, повтор через ${delayMs / 1000}с (попытка ${i + 1}/${retries})${lbl}`,
        );
        await waitForRetry(delayMs, signal);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

export async function retryWith429And400<T>(
  fn: () => Promise<T>,
  retry429: { enabled: boolean; maxRetries: number; delayMs: number },
  retry400: { enabled: boolean; maxRetries: number; delayMs: number },
  label: string = "",
  signal?: AbortSignal,
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
    checkAbort(signal);
    try {
      return await fn();
    } catch (err) {
      checkAbort(signal);
      const error = err as { status?: number };
      const status = error.status;
      const lbl = label ? ` [${label}]` : "";

      if (
        status === 429 &&
        retry429.enabled &&
        attempts429 < retry429.maxRetries
      ) {
        attempts429++;
        last429Error = err;
        log(
          `Получен 429, повтор через ${retry429.delayMs / 1000}с (429-попытка ${attempts429}/${retry429.maxRetries})${lbl}`,
        );
        await waitForRetry(retry429.delayMs, signal);
        continue;
      }

      if (
        status === 400 &&
        retry400.enabled &&
        attempts400 < retry400.maxRetries
      ) {
        attempts400++;
        last400Error = err;
        log(
          `Получен 400, повтор через ${retry400.delayMs / 1000}с (400-попытка ${attempts400}/${retry400.maxRetries})${lbl}`,
        );
        await waitForRetry(retry400.delayMs, signal);
        continue;
      }

      throw err;
    }
  }

  throw last429Error || last400Error || new Error("Unreachable");
}
