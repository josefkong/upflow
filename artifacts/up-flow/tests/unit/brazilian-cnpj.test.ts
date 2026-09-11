import assert from "node:assert/strict";
import test from "node:test";
import {
  cnpjDigits,
  formatBrazilianCnpj,
  isBrazilianCnpj,
} from "../../src/lib/brazilian-cnpj";

test("Brazilian CNPJ formatting and check digits are validated", () => {
  assert.equal(formatBrazilianCnpj("04252011000110"), "04.252.011/0001-10");
  assert.equal(cnpjDigits("04.252.011/0001-10"), "04252011000110");
  assert.equal(isBrazilianCnpj("04.252.011/0001-10"), true);
  assert.equal(isBrazilianCnpj("04.252.011/0001-11"), false);
  assert.equal(isBrazilianCnpj("11.111.111/1111-11"), false);
});
