import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("list view uses contribution capability for every inline task mutation", () => {
  const listView = read("src/components/projects/list-view.tsx");

  assert.match(listView, /canContribute\?: boolean;/);
  assert.match(listView, /const canMutateTasks = canContribute \?\? canCreate;/);
  assert.match(
    listView,
    /const updateField = async[\s\S]*?\{\s*if \(!canMutateTasks\) return;[\s\S]*?fetch\(`\/api\/tasks\/\$\{taskId\}\/custom-fields`/,
  );
  assert.match(
    listView,
    /const updateTask = async[\s\S]*?\{\s*if \(!canMutateTasks\) return;[\s\S]*?fetch\(`\/api\/tasks\/\$\{taskId\}`/,
  );
  assert.match(listView, /\{canMutateTasks && canAddTasks && \(/);
});

test("list view disables edit controls and cannot enable bulk mutation for read-only members", () => {
  const listView = read("src/components/projects/list-view.tsx");

  assert.match(listView, /selectionMode &&\s*onToggleTaskSelection &&\s*canMutateTasks/);
  assert.match(
    listView,
    /value=\{t\.assignee\?\.id \?\? ""\}[\s\S]*?disabled=\{!canMutateTasks\}/,
  );
  assert.match(
    listView,
    /<BrazilianDateInput[\s\S]*?disabled=\{!canMutateTasks\}/,
  );
  assert.match(
    listView,
    /value=\{t\.priority\}[\s\S]*?disabled=\{!canMutateTasks\}/,
  );
  assert.match(listView, /value=\{t\.status\}[\s\S]*?disabled[\s\S]*?task\.automaticMovementOnly/);
  assert.match(
    listView,
    /<fieldset\s+disabled=\{!canMutateTasks\}[\s\S]*?<CustomFieldInput/s,
  );
  assert.match(listView, /onCommit=\{\(value\) => updateTask\(t\.id, \{ due_date: value \|\| null \}\)\}/);
});
