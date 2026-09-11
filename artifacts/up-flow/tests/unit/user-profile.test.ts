import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBrazilianMobilePhone,
  formatPersonName,
  isPhoneLikeName,
  isValidBrazilianMobilePhone,
  normalizeDisplayName,
  normalizePhone,
} from "../../src/lib/user-profile";

test("profile normalization keeps names and phones separate", () => {
  assert.equal(normalizePhone("  +55 11 99999-9999  "), "+55 11 99999-9999");
  assert.equal(isPhoneLikeName("+55 11 99999-9999"), true);
  assert.equal(isPhoneLikeName("Alex Johnson"), false);
  assert.equal(
    normalizeDisplayName("Alex Johnson", "alex@example.com", "+55 11 99999-9999"),
    "Alex Johnson",
  );
  assert.equal(
    normalizeDisplayName("+55 11 99999-9999", "alex@example.com", "+55 11 99999-9999"),
    "alex",
  );
});

test("profile names capitalize the first letter of every part", () => {
  assert.equal(formatPersonName("josef kong"), "Josef Kong");
  assert.equal(formatPersonName("JOÃO da silva"), "João Da Silva");
  assert.equal(formatPersonName("ana-maria d'ávila"), "Ana-Maria D'Ávila");
});

test("Brazilian mobile phones are masked and validated with eleven digits", () => {
  assert.equal(formatBrazilianMobilePhone("11987654321"), "(11) 98765-4321");
  assert.equal(formatBrazilianMobilePhone("+55 11 98765-4321"), "(11) 98765-4321");
  assert.equal(formatBrazilianMobilePhone("11987"), "(11) 987");
  assert.equal(isValidBrazilianMobilePhone("(11) 98765-4321"), true);
  assert.equal(isValidBrazilianMobilePhone("(11) 9876-5432"), false);
  assert.equal(isValidBrazilianMobilePhone(""), false);
});
