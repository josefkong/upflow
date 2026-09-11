import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("shared buttons use the UP Flow control dimensions and spacing", () => {
  const standards = read("src/components/ui/control-standards.ts");
  const button = read("src/components/ui/button.tsx");
  const createButton = read("src/components/ui/create-action-button.tsx");

  assert.match(standards, /h-9 min-h-9 px-3/);
  assert.match(standards, /gap-2/);
  assert.match(standards, /rounded-xl/);
  assert.match(standards, /text-xs font-semibold/);
  assert.match(standards, /\[&_svg\]:h-4 \[&_svg\]:w-4/);
  assert.match(button, /upflowControlBaseClassName/);
  assert.match(button, /upflowControlDefaultSizeClassName/);
  assert.match(createButton, /upflowControlBaseClassName/);
  assert.match(createButton, /upflowControlDefaultSizeClassName/);
  assert.doesNotMatch(createButton, /translate-y/);
});

test("page toolbars keep controls in the same 36px tier", () => {
  const calendar = read("src/app/(dashboard)/calendar/page.tsx");
  const team = read("src/app/(dashboard)/team/page.tsx");
  const project = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const clients = read("src/app/(dashboard)/clients/page.tsx");

  assert.match(calendar, /justify-end gap-2 sm:w-auto sm:flex-nowrap sm:pt-1/);
  assert.match(calendar, /h-9 rounded-xl bg-muted\/50 px-3 text-xs font-semibold/);
  assert.doesNotMatch(calendar, /sm:gap-1 sm:pt-1/);
  assert.doesNotMatch(team, /sm:h-11/);
  assert.match(project, /inline-flex h-9 min-h-9 items-center gap-2/);
  assert.match(clients, /inline-flex h-9 min-h-9 items-center gap-2 rounded-xl px-3/);
});

test("native dropdown indicators keep the shared UP Flow edge spacing", () => {
  const globals = read("src/app/globals.css");
  const indicator = read("public/assets/lucide-chevron-down.svg");

  assert.match(globals, /select:not\(\[multiple\]\):not\(\[size\]\):not\(\.appearance-none\)/);
  assert.match(globals, /background-position: right 0\.875rem center/);
  assert.match(globals, /padding-inline-end: 2\.75rem !important/);
  assert.match(globals, /\.upflow-select-chevron\s*\{[^}]*inset-inline-end: 0\.875rem !important/s);
  assert.match(indicator, /viewBox="0 0 24 24"/);
  assert.match(indicator, /m6 9 6 6 6-6/);
});
