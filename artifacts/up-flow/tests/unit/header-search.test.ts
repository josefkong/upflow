import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

test("header search keeps a native navigation fallback before hydration", () => {
  const header = readFileSync(join(ROOT, "src/components/layout/header.tsx"), "utf8");

  assert.match(header, /data-testid="header-global-search"/);
  assert.match(header, /<form[\s\S]*action="\/search"[\s\S]*method="get"/);
  assert.match(header, /type="search"[\s\S]*name="q"/);
  assert.match(header, /new FormData\(e\.currentTarget\)\.get\("q"\)/);
  assert.match(header, /router\.push\(`\/search\?q=\$\{encodeURIComponent\(normalizedQuery\)\}`\)/);
});

test("global header controls keep a stable right-edge group without a new-project button", () => {
  const header = readFileSync(join(ROOT, "src/components/layout/header.tsx"), "utf8");
  const layout = readFileSync(
    join(ROOT, "src/app/(dashboard)/layout.tsx"),
    "utf8",
  );
  const team = readFileSync(
    join(ROOT, "src/app/(dashboard)/team/page.tsx"),
    "utf8",
  );

  assert.match(header, /data-testid="header-global-controls"/);
  assert.match(header, /className="ml-auto flex shrink-0 items-center gap-2"/);
  assert.match(header, /onClick=\{\(\) => window\.location\.reload\(\)\}/);
  assert.match(header, /aria-label=\{t\("header\.refresh"\)\}/);
  assert.match(header, /<RefreshCw/);
  assert.ok(header.indexOf("{actions}") < header.indexOf('data-testid="header-global-controls"'));
  assert.doesNotMatch(header, /NewProjectDialog/);
  assert.doesNotMatch(header, /showNewProject/);
  assert.doesNotMatch(header, /t\("header\.newProject"\)/);
  assert.doesNotMatch(team, /hideUtilityControls/);
  assert.doesNotMatch(team, /hideDefaultPrimaryAction/);
  assert.match(layout, /\[scrollbar-gutter:stable\]/);
});

test("every primary sidebar category renders the shared searchable header", () => {
  const categoryPages = [
    "src/app/(dashboard)/page.tsx",
    "src/app/(dashboard)/team/page.tsx",
    "src/app/(dashboard)/time/page.tsx",
    "src/app/(dashboard)/inbox/page.tsx",
    "src/app/(dashboard)/calendar/page.tsx",
    "src/app/(dashboard)/sala-de-reuniao/page.tsx",
    "src/app/(dashboard)/projects/page.tsx",
    "src/app/(dashboard)/clients/page.tsx",
    "src/app/(dashboard)/onboarding/page.tsx",
    "src/app/(dashboard)/activity/page.tsx",
  ];

  for (const categoryPage of categoryPages) {
    assert.match(
      readFileSync(join(ROOT, categoryPage), "utf8"),
      /<Header\b/,
      `${categoryPage} should render the shared header search`,
    );
  }
});
