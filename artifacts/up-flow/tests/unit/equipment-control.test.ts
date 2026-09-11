import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("General Administration receives one canonical equipment-control project", () => {
  const helper = read("src/lib/equipment-control-shared.ts");
  const migration = read(
    "prisma/migrations/20260902120000_add_equipment_checkout_flow/migration.sql",
  );
  const departments = read("src/lib/department-spaces.ts");

  assert.match(helper, /EQUIPMENT_PROJECT_NAME = "Equipment Control"/);
  assert.match(helper, /isGeneralAdministrationSpaceName/);
  assert.match(departments, /ensureEquipmentControlProject/);
  assert.match(migration, /INSERT INTO "Project"/);
  assert.match(migration, /general admin/);
});

test("equipment requests use locked, condition-based custody transitions", () => {
  const request = read("src/app/api/equipment/[id]/request/route.ts");
  const transition = read("src/app/api/equipment/requests/[id]/route.ts");

  assert.match(request, /FOR UPDATE/);
  assert.match(request, /current\.status !== "available"/);
  assert.match(transition, /confirm_handover/);
  assert.match(transition, /confirm_receipt/);
  assert.match(transition, /request_return/);
  assert.match(transition, /confirm_return/);
  assert.match(transition, /condition === "damaged" \? "maintenance" : "available"/);
  assert.match(transition, /equipmentCustodyEvent\.create/);
  assert.match(transition, /sendEquipmentNotifications/);
});

test("handover requires Administration and receipt requires the requester", () => {
  const transition = read("src/app/api/equipment/requests/[id]/route.ts");

  assert.match(transition, /managerAction/);
  assert.match(transition, /requesterAction/);
  assert.match(transition, /managerAction && !isManager/);
  assert.match(transition, /requesterAction && !isRequester/);
  assert.match(transition, /current\.status !== "awaiting_receipt"/);
  assert.match(transition, /MINIMUM_HANDOVER_PHOTOS/);
  assert.match(transition, /purpose_and_photos_confirmed/);
  assert.match(transition, /photo_match_confirmed/);
  assert.match(transition, /"request_return",\s*"confirm_return"/);
});

test("equipment requests use fixed purposes, terms, and a one-hour minimum", () => {
  const options = read("src/lib/equipment-request-options.ts");
  const request = read("src/app/api/equipment/[id]/request/route.ts");
  const board = read("src/components/equipment/equipment-control-board.tsx");

  assert.match(options, /"shooting"/);
  assert.match(options, /"presentation"/);
  assert.match(options, /"recording"/);
  assert.match(options, /"home_office"/);
  assert.match(request, /terms_accepted: z\.literal\(true\)/);
  assert.match(request, /MINIMUM_EQUIPMENT_USE_MS/);
  assert.match(board, /Concordo com os Termos de Uso do Equipamento/);
  assert.match(board, /showPicker/);
});

test("equipment evidence stays private and gates handover and inspection", () => {
  const upload = read("src/app/api/equipment/requests/[id]/photos/route.ts");
  const signedView = read(
    "src/app/api/equipment/requests/[id]/photos/[kind]/[index]/route.ts",
  );
  const transition = read("src/app/api/equipment/requests/[id]/route.ts");

  assert.match(upload, /canManageEquipment/);
  assert.match(upload, /MAX_IMAGE_BYTES = 5_000_000/);
  assert.match(upload, /imageTypeFromBytes/);
  assert.match(upload, /TASK_ASSETS_BUCKET/);
  assert.match(signedView, /createSignedUrl/);
  assert.match(signedView, /isRequester/);
  assert.match(transition, /damage_photo_paths\.length === 0/);
  assert.match(transition, /inspection_confirmed/);
  assert.match(transition, /damage_notice_confirmed/);
});

test("overdue equipment notifies the requester and Administration once", () => {
  const helper = read("src/lib/equipment-control.ts");
  const pulse = read("src/app/api/commercial/automations/pulse/route.ts");
  const cron = read("src/app/api/cron/due-soon/route.ts");

  assert.match(helper, /processOverdueEquipmentReturns/);
  assert.match(helper, /overdue_notified_at: null/);
  assert.match(helper, /action: "return_overdue"/);
  assert.match(pulse, /equipment_overdue/);
  assert.match(cron, /equipment_overdue/);
});

test("equipment system tasks cannot be created, edited, moved, or deleted manually", () => {
  const tasks = read("src/app/api/tasks/route.ts");
  const task = read("src/app/api/tasks/[id]/route.ts");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");

  assert.match(tasks, /isEquipmentControlProject/);
  assert.match(tasks, /tarefas de equipamentos são criadas e avançam somente/);
  assert.match(task, /oldTask\.equipment_checkout/);
  assert.match(task, /task\.equipment_checkout/);
  assert.match(projectPage, /!isEquipmentControl/);
  assert.match(projectPage, /<EquipmentControlBoard projectId=\{id\}/);
});

test("inventory UI exposes responsive filters, history, and role-specific confirmations", () => {
  const board = read(
    "src/components/equipment/equipment-control-board.tsx",
  );

  assert.match(board, /md:grid-cols-2 2xl:grid-cols-3/);
  assert.match(board, /Aceitar Solicitação/);
  assert.match(board, /Confirmar Retirada/);
  assert.match(board, /Solicitar Devolução/);
  assert.match(board, /Inspecionar Devolução/);
  assert.match(board, /Ver Histórico/);
  assert.match(board, /Histórico de Uso/);
  assert.match(board, /requester_receipt_confirmed_at/);
  assert.match(board, /admin_return_confirmed_at/);
  assert.match(board, /Utilizado por/);
  assert.match(board, /Devolvido em/);
  assert.match(board, /data\.viewer\.can_manage/);
  assert.match(board, /canDelete && <Button[^>]*onClick=\{onDelete\}/);
  assert.match(board, /Excluir Equipamento/);
});

test("only equipment administrators can archive idle equipment", () => {
  const item = read("src/app/api/equipment/[id]/route.ts");

  assert.match(item, /async function DELETE_handler/);
  assert.match(item, /!isWorkspaceAdminFor\(auth, item\.workspace_id\)/);
  assert.match(item, /EQUIPMENT_ACTIVE_CHECKOUT_STATUSES/);
  assert.match(item, /Conclua ou cancele a solicitação em andamento/);
  assert.match(item, /active: false, status: "archived"/);
  assert.match(item, /event_type: "equipment_archived"/);
  assert.match(item, /Histórico preservado/);
});

test("equipment tables are protected from direct public API access", () => {
  const migration = read(
    "prisma/migrations/20260902120000_add_equipment_checkout_flow/migration.sql",
  );

  for (const table of [
    "EquipmentItem",
    "EquipmentCheckout",
    "EquipmentCustodyEvent",
  ]) {
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`REVOKE ALL ON TABLE "${table}" FROM anon, authenticated`));
  }
});
