"use client";

import { getCachedJson } from "@/lib/client-cache";

export const projectPageCacheKeys = {
  project: (projectId: string) => `project-page:${projectId}:project`,
  tasks: (projectId: string) => `project-page:${projectId}:tasks`,
  fields: (projectId: string) => `project-page:${projectId}:fields`,
  workflows: (projectId: string) => `project-page:${projectId}:workflows`,
  users: (workspaceId: string) => `project-page:${workspaceId}:users`,
  me: "project-page:me",
} as const;

export function prefetchProjectPage(projectId: string) {
  return Promise.allSettled([
    getCachedJson(
      projectPageCacheKeys.project(projectId),
      `/api/projects/${projectId}`,
      { ttlMs: 10_000 },
    ),
    getCachedJson(
      projectPageCacheKeys.tasks(projectId),
      `/api/tasks?project_id=${projectId}`,
      { ttlMs: 10_000 },
    ),
    getCachedJson(
      projectPageCacheKeys.fields(projectId),
      `/api/projects/${projectId}/custom-fields`,
      { ttlMs: 30_000 },
    ),
    getCachedJson(
      projectPageCacheKeys.workflows(projectId),
      `/api/workflow-statuses?project_id=${projectId}&category=task&limit=100`,
      { ttlMs: 30_000 },
    ),
  ]);
}
