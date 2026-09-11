import assert from "node:assert/strict";
import test from "node:test";
import {
  isCommercialOrSalesDepartmentName,
  isCreativeDesignDepartmentName,
  resolveCompanyCreationAccess,
} from "../../src/lib/company-creation-access";

test("Creative & Design aliases are recognized without widening access to other teams", () => {
  assert.equal(isCreativeDesignDepartmentName("Creative & Design"), true);
  assert.equal(isCreativeDesignDepartmentName("Creative and Design"), true);
  assert.equal(isCreativeDesignDepartmentName("Cria\u00e7\u00e3o e Design"), true);
  assert.equal(isCreativeDesignDepartmentName("Criativos / Design"), true);
  assert.equal(isCreativeDesignDepartmentName("Design & Criativo"), true);
  assert.equal(isCreativeDesignDepartmentName("Design and Creative"), true);
  assert.equal(isCreativeDesignDepartmentName("Marketing"), false);
  assert.equal(isCreativeDesignDepartmentName("Creative Marketing"), false);
  assert.equal(isCreativeDesignDepartmentName(null), false);
});

test("Commercial and Sales aliases receive onboarding access", () => {
  assert.equal(isCommercialOrSalesDepartmentName("Commercial"), true);
  assert.equal(isCommercialOrSalesDepartmentName("Comercial / Vendas"), true);
  assert.equal(isCommercialOrSalesDepartmentName("Sales Operations"), true);
  assert.equal(isCommercialOrSalesDepartmentName("Marketing"), false);
  const commercial = resolveCompanyCreationAccess({ isWorkspaceAdmin: false, membership: { role: "member", status: "active", departmentName: "Commercial" } });
  assert.equal(commercial.canStartOnboarding, true);
  assert.equal(commercial.canCreateCompleteClient, true);
  assert.equal(commercial.canCreateStandalone, false);
});

test("Finance can create a complete client without receiving onboarding access", () => {
  const finance = resolveCompanyCreationAccess({
    isWorkspaceAdmin: false,
    membership: {
      role: "member",
      status: "active",
      departmentName: "Financeiro",
    },
  });
  assert.deepEqual(finance, {
    canCreateStandalone: false,
    canCreateCompleteClient: true,
    canStartOnboarding: false,
    forceCreatorAsOwner: false,
  });
});

test("only active non-guest Creative members receive the standalone client permission", () => {
  const creative = resolveCompanyCreationAccess({
    isWorkspaceAdmin: false,
    membership: { role: "member", status: "active", departmentName: "Creative & Design" },
  });
  assert.deepEqual(creative, {
    canCreateStandalone: true,
    canCreateCompleteClient: false,
    canStartOnboarding: false,
    forceCreatorAsOwner: true,
  });

  for (const membership of [
    { role: "guest", status: "active", departmentName: "Creative & Design" },
    { role: "member", status: "inactive", departmentName: "Creative & Design" },
    { role: "member", status: "active", departmentName: "Marketing" },
  ]) {
    assert.deepEqual(resolveCompanyCreationAccess({ isWorkspaceAdmin: false, membership }), {
      canCreateStandalone: false,
      canCreateCompleteClient: false,
      canStartOnboarding: false,
      forceCreatorAsOwner: false,
    });
  }
});

test("workspace admins retain standalone, onboarding, and owner-assignment access", () => {
  assert.deepEqual(
    resolveCompanyCreationAccess({
      isWorkspaceAdmin: true,
      membership: { role: "guest", status: "active", departmentName: "Creative & Design" },
    }),
    {
      canCreateStandalone: true,
      canCreateCompleteClient: true,
      canStartOnboarding: true,
      forceCreatorAsOwner: false,
    },
  );
});
