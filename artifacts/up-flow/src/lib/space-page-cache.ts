"use client";

import { getCachedJson } from "@/lib/client-cache";
import type {
  SpaceContainerData,
  SpaceDashboardData,
} from "@/components/spaces/space-page-types";

export const SPACE_DASHBOARD_LIMIT = 100;

export const spacePageCacheKeys = {
  container: (spaceId: string) => `space-page:${spaceId}:container`,
  dashboard: (spaceId: string) => `space-page:${spaceId}:dashboard`,
} as const;

export function prefetchSpacePage(spaceId: string) {
  return Promise.allSettled([
    getCachedJson<SpaceContainerData>(
      spacePageCacheKeys.container(spaceId),
      `/api/spaces/${spaceId}`,
      { ttlMs: 30_000 },
    ),
    getCachedJson<SpaceDashboardData>(
      spacePageCacheKeys.dashboard(spaceId),
      `/api/spaces/${spaceId}/dashboard?limit=${SPACE_DASHBOARD_LIMIT}`,
      { ttlMs: 10_000 },
    ),
  ]);
}
