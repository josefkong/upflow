import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("waits for the project workflow before rendering its board", () => {
  const projectPage = source("src/app/(dashboard)/projects/[id]/page.tsx");

  assert.match(
    projectPage,
    /const \[\[f, m, w\], p, t\] = await Promise\.all\(\[/,
  );
  assert.match(
    projectPage,
    /setWorkflowStatuses\(w\.items \?\? \[\]\);\s+setMe\(m\);\s+setLoading\(false\);/,
  );
  assert.match(projectPage, /nextCachedFields === null/);
  assert.match(projectPage, /nextCachedWorkflows === null/);
});

test("prefetches board metadata together with project and tasks", () => {
  const projectCache = source("src/lib/project-page-cache.ts");

  assert.match(projectCache, /projectPageCacheKeys\.fields\(projectId\)/);
  assert.match(projectCache, /projectPageCacheKeys\.workflows\(projectId\)/);
  assert.match(projectCache, /category=task&limit=100/);
});
