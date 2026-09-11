import assert from "node:assert/strict";
import test from "node:test";
import {
  canAdvanceCommercialContract,
  isFinanceDepartmentName,
} from "../../src/lib/commercial-contract-access";

test("recognizes only the Finance department names used by the workspace", () => {
  assert.equal(isFinanceDepartmentName("Finance"), true);
  assert.equal(isFinanceDepartmentName("Financeiro"), true);
  assert.equal(isFinanceDepartmentName("  FINANCEIRO  "), true);
  assert.equal(isFinanceDepartmentName("Comercial"), false);
  assert.equal(isFinanceDepartmentName("General Admin"), false);
  assert.equal(isFinanceDepartmentName(null), false);
});

test("the global UP Flow administrator can advance contracts independently of department", async () => {
  assert.equal(
    await canAdvanceCommercialContract({
      workspaceId: "workspace-id",
      userId: "admin-id",
      isUpFlowAdmin: true,
    }),
    true,
  );
});
