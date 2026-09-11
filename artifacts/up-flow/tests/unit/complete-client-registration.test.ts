import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("Clients registry exposes an authorized complete client workflow", () => {
  const registry = read("src/components/clients/client-space-registry.tsx");
  const dialog = read("src/components/dashboard/create-company-dialog.tsx");
  const route = read("src/app/api/companies/route.ts");
  const access = read("src/lib/company-creation-access.ts");

  assert.match(registry, /data-testid="create-complete-client"/);
  assert.match(registry, /mode="complete"/);
  assert.match(registry, /financialsVisible=/);
  assert.match(dialog, /complete_registration: completeClientMode/);
  assert.match(dialog, /companyDialog\.completeTitle/);
  assert.match(dialog, /companyDialog\.legalName/);
  assert.match(dialog, /companyDialog\.cnpj/);
  assert.match(dialog, /COMPLETE_CLIENT_PLAN_OPTIONS/);
  assert.match(dialog, /COMPLETE_CLIENT_SERVICE_OPTIONS/);
  assert.match(dialog, /COMMERCIAL_CONTRACT_SERVICES/);
  assert.match(dialog, /!completeClientMode \? \(\s*<option value="custom">/);
  assert.match(dialog, /includedServices\.length === 0/);
  assert.match(dialog, /formatBrazilianMobile\(contactPhone\)/);
  assert.match(route, /complete_registration: z\.boolean\(\)\.optional\(\)/);
  assert.match(route, /companyCreationAccess\.canCreateCompleteClient/);
  assert.match(route, /isBrazilianCnpj/);
  assert.match(route, /isBrazilianMobile/);
  assert.match(route, /Já existe um cliente com esta marca ou CNPJ/);
  assert.match(access, /canCreateCompleteClient/);
});

test("complete registration preserves financial visibility boundaries", () => {
  const dialog = read("src/components/dashboard/create-company-dialog.tsx");
  const route = read("src/app/api/companies/route.ts");

  assert.match(
    dialog,
    /completeClientMode &&\s*financialsVisible[\s\S]*\? parsedContractValue/,
  );
  assert.match(dialog, /companyDialog\.financialRestricted/);
  assert.match(route, /canViewFinancials &&[\s\S]*parsed\.data\.contract_value/);
  assert.match(route, /includesFinancialData && !canViewFinancials/);
});
