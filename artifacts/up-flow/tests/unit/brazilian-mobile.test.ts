import assert from "node:assert/strict";
import test from "node:test";
import {
  brazilianMobileDigits,
  formatBrazilianMobile,
  isBrazilianMobile,
} from "../../src/lib/brazilian-mobile";

test("Brazilian mobile numbers use DD XXXXX-XXXX and exactly nine local digits", () => {
  assert.equal(formatBrazilianMobile("11957578999"), "11 95757-8999");
  assert.equal(formatBrazilianMobile("11 95757-8999"), "11 95757-8999");
  assert.equal(brazilianMobileDigits("+55 (11) 95757-8999"), "11957578999");
  assert.equal(isBrazilianMobile("11 95757-8999"), true);
  assert.equal(isBrazilianMobile("11 9575-7899"), false);
});
