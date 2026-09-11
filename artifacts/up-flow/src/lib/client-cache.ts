"use client";

import { ApiResponseError } from "@/lib/client-auth-recovery";

type CacheEntry<T> = {
  data: T;
  loadedAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function peekCachedJson<T>(key: string): T | null {
  return (cache.get(key) as CacheEntry<T> | undefined)?.data ?? null;
}

export function getCachedJson<T>(
  key: string,
  url: string,
  options?: { ttlMs?: number; force?: boolean },
): Promise<T> {
  const ttlMs = options?.ttlMs ?? 30_000;
  const force = options?.force === true;
  const cached = cache.get(key) as CacheEntry<T> | undefined;

  if (!force && cached && Date.now() - cached.loadedAt < ttlMs) {
    return Promise.resolve(cached.data);
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (!force && pending) return pending;

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new ApiResponseError(`Request failed: ${response.status}`, response.status);
      }
      return (await response.json()) as T;
    })
    .then((data) => {
      cache.set(key, { data, loadedAt: Date.now() });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function primeCachedJson<T>(key: string, data: T) {
  cache.set(key, { data, loadedAt: Date.now() });
}

export function clearCachedJson(key: string) {
  cache.delete(key);
  inflight.delete(key);
}
