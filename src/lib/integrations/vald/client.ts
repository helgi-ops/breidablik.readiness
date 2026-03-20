import "server-only";

import { ValdApiError, ValdRateLimitError } from "./errors";

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function valdRequestJson<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const maxAttempts = 3;
  const timeoutMs = options.timeoutMs ?? 15000;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(options.headers ?? {}),
        },
        body: options.body == null ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        throw new ValdRateLimitError("VALD API rate limit.", Number.isFinite(retryAfter) ? retryAfter * 1000 : null);
      }

      const text = await response.text();
      const payload = text ? safeJsonParse(text) : null;
      if (!response.ok) {
        throw new ValdApiError(`VALD API request failed (${response.status})`, response.status, payload ?? text);
      }
      return payload as T;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable =
        lastError instanceof ValdRateLimitError ||
        (lastError instanceof ValdApiError && ((lastError.status ?? 0) >= 500)) ||
        lastError.name === "AbortError";
      if (!retryable || attempt === maxAttempts) break;
      await delay(250 * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error("Unknown VALD request failure.");
}
