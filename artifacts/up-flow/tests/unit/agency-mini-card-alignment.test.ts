import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const agencyPanel = readFileSync(
  join(process.cwd(), "src/components/dashboard/agency-operations-panel.tsx"),
  "utf8",
);

test("agency metric cards reserve equal rows for one and two-line copy", () => {
  assert.match(agencyPanel, /min-h-\[114px\] rounded-xl px-4 py-3/);
  assert.match(
    agencyPanel,
    /line-clamp-1 h-4 text-xs font-semibold uppercase leading-4/,
  );
  assert.match(
    agencyPanel,
    /mt-2 flex h-7 items-center text-xl font-bold leading-7/,
  );
  assert.match(
    agencyPanel,
    /mt-1 line-clamp-2 h-8 text-xs leading-4/,
  );
});
