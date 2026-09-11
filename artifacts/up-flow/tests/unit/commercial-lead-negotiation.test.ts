import assert from "node:assert/strict";
import test from "node:test";

import {
  negotiatedScopeItems,
  validateCommercialLeadNegotiation,
} from "../../src/lib/commercial-lead-negotiation";

test("Starter and Growth expose their exact negotiated service scopes", () => {
  const starter = negotiatedScopeItems("starter", "none").map(
    (item) => item.key,
  );
  const growth = negotiatedScopeItems("growth", "none").map((item) => item.key);

  assert.equal(starter.length, 9);
  assert.deepEqual(growth.slice(0, starter.length), starter);
  assert.deepEqual(growth.slice(starter.length), [
    "group_up.motion_team",
    "group_up.crm_team",
    "group_up.dashboard_erp",
  ]);
});

test("each UP Zero plan has the requested scope", () => {
  assert.deepEqual(
    negotiatedScopeItems("none", "essential").map((item) => item.key),
    ["up_zero.standard_template", "up_zero.users_3"],
  );
  assert.deepEqual(
    negotiatedScopeItems("none", "pro").map((item) => item.key),
    ["up_zero.standard_template", "up_zero.training_4", "up_zero.users_6"],
  );
  assert.deepEqual(
    negotiatedScopeItems("none", "elite").map((item) => item.key),
    ["up_zero.custom_template", "up_zero.training_8", "up_zero.users_0"],
  );
});

test("UP Zero implementation fee and every scope confirmation are mandatory", () => {
  const negotiatedScope = negotiatedScopeItems("starter", "pro").map(
    (item) => item.key,
  );
  const withoutFee = validateCommercialLeadNegotiation({
    groupUpPlan: "starter",
    groupUpMonthlyFee: 5_000,
    upZeroPlan: "pro",
    upZeroMonthlyFee: 1_000,
    upZeroImplementationFee: null,
    negotiatedScope,
  });
  assert.deepEqual(withoutFee, {
    ok: false,
    field: "up_zero_implementation_fee",
  });

  const incompleteScope = validateCommercialLeadNegotiation({
    groupUpPlan: "starter",
    groupUpMonthlyFee: 5_000,
    upZeroPlan: "pro",
    upZeroMonthlyFee: 1_000,
    upZeroImplementationFee: 500,
    negotiatedScope: negotiatedScope.slice(1),
  });
  assert.deepEqual(incompleteScope, {
    ok: false,
    field: "negotiated_scope",
  });

  const complete = validateCommercialLeadNegotiation({
    groupUpPlan: "starter",
    groupUpMonthlyFee: 5_000,
    upZeroPlan: "pro",
    upZeroMonthlyFee: 1_000,
    upZeroImplementationFee: 0,
    negotiatedScope,
  });
  assert.equal(complete.ok, true);
});
