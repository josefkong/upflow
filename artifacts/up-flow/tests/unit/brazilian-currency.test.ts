import assert from "node:assert/strict";
import test from "node:test";

import {
  brazilianCurrencyDigits,
  formatBrazilianCurrencyInteger,
  formatBrazilianCurrencyText,
  normalizeBrazilianCurrencyInteger,
} from "../../src/lib/brazilian-currency";

test("Brazilian currency fields keep a fixed prefix and group thousands with dots", () => {
  assert.equal(brazilianCurrencyDigits("R$ 3.000"), "3000");
  assert.equal(formatBrazilianCurrencyInteger("3000"), "3.000");
  assert.equal(formatBrazilianCurrencyInteger("899"), "899");
  assert.equal(formatBrazilianCurrencyText(3000), "R$ 3.000");
  assert.equal(normalizeBrazilianCurrencyInteger("3000.00"), "3000");
});
