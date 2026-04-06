import { WHOOP_API_BASE } from "./config";
import type {
  WhoopCollectionResponse,
  WhoopProfile,
  WhoopRecoveryRecord,
  WhoopSleepRecord,
  WhoopWorkoutRecord,
} from "./types";

type QueryValue = string | number | boolean | null | undefined;

export class WhoopApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "WhoopApiError";
    this.status = status;
    this.code = code;
  }
}

function withQuery(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path, WHOOP_API_BASE);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function whoopFetch<T>(accessToken: string, path: string, query?: Record<string, QueryValue>): Promise<T> {
  const response = await fetch(withQuery(path, query), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as
    | T
    | { message?: string; error?: string; code?: string; error_description?: string }
    | null;
  if (!response.ok || json == null) {
    const detail =
      json && typeof json === "object" && "message" in json && json.message
        ? json.message
        : json && typeof json === "object" && "error" in json && json.error
          ? json.error
          : json && typeof json === "object" && "error_description" in json && json.error_description
            ? json.error_description
          : `WHOOP API request failed (${response.status})`;
    throw new WhoopApiError(response.status, detail, json && typeof json === "object" && "code" in json ? json.code : undefined);
  }

  return json as T;
}

export async function getWhoopProfile(accessToken: string): Promise<WhoopProfile> {
  return whoopFetch<WhoopProfile>(accessToken, "/developer/v2/user/profile/basic");
}

export async function getWhoopRecovery(
  accessToken: string,
  params: { start: string; end: string; limit?: number; nextToken?: string | null },
): Promise<WhoopCollectionResponse<WhoopRecoveryRecord>> {
  return whoopFetch<WhoopCollectionResponse<WhoopRecoveryRecord>>(accessToken, "/developer/v2/recovery", {
    start: params.start,
    end: params.end,
    limit: params.limit ?? 25,
    nextToken: params.nextToken ?? undefined,
    next_token: params.nextToken ?? undefined,
  });
}

export async function getWhoopSleep(
  accessToken: string,
  params: { start: string; end: string; limit?: number; nextToken?: string | null },
): Promise<WhoopCollectionResponse<WhoopSleepRecord>> {
  return whoopFetch<WhoopCollectionResponse<WhoopSleepRecord>>(accessToken, "/developer/v2/activity/sleep", {
    start: params.start,
    end: params.end,
    limit: params.limit ?? 25,
    nextToken: params.nextToken ?? undefined,
    next_token: params.nextToken ?? undefined,
  });
}

export async function getWhoopWorkouts(
  accessToken: string,
  params: { start: string; end: string; limit?: number; nextToken?: string | null },
): Promise<WhoopCollectionResponse<WhoopWorkoutRecord>> {
  return whoopFetch<WhoopCollectionResponse<WhoopWorkoutRecord>>(accessToken, "/developer/v2/activity/workout", {
    start: params.start,
    end: params.end,
    limit: params.limit ?? 25,
    nextToken: params.nextToken ?? undefined,
    next_token: params.nextToken ?? undefined,
  });
}

export async function getAllWhoopPages<T>(loader: (nextToken?: string | null) => Promise<WhoopCollectionResponse<T>>, maxPages = 8): Promise<T[]> {
  const all: T[] = [];
  let nextToken: string | null | undefined = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await loader(nextToken);
    all.push(...(result.records ?? []));
    const token = result.next_token ?? (result as WhoopCollectionResponse<T> & { nextToken?: string | null }).nextToken ?? null;
    if (!token) break;
    nextToken = token;
  }
  return all;
}
