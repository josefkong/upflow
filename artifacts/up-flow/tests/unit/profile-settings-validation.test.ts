import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

test("profile settings require and normalize name, email, and phone", () => {
  const page = source("src/app/(dashboard)/settings/page.tsx");
  const route = source("src/app/api/auth/me/route.ts");

  assert.match(page, /name: formatPersonName\(event\.target\.value\)/);
  assert.match(page, /phone: formatBrazilianMobilePhone\(event\.target\.value\)/);
  assert.match(page, /pattern="\\\(\\d\{2\}\\\) \\d\{5\}-\\d\{4\}"/);
  assert.equal(page.match(/required/g)?.length, 3);

  assert.match(route, /name: z\.string\(\)\.trim\(\)\.min\(1/);
  assert.match(route, /email: z\.string\(\)\.trim\(\)\.email/);
  assert.match(route, /phone: z\.string\(\)\.trim\(\)\.min\(1/);
  assert.match(route, /isValidBrazilianMobilePhone\(phone\)/);
});
