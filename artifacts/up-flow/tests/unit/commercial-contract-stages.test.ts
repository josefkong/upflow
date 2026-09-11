import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCIAL_CONTRACT_STAGES,
  commercialContractStageFromLead,
  commercialContractStageName,
} from "../../src/lib/commercial-contract-stages";
import {
  activityEventLabel,
  formatActivityDateTime,
} from "../../src/lib/activity-labels";

test("contract workflow keeps the required automatic stage order", () => {
  assert.deepEqual(
    COMMERCIAL_CONTRACT_STAGES.map((stage) => stage.name),
    [
      "Preenchimento de Informações",
      "Elaboração de Contrato",
      "Contrato Enviado",
      "Contrato Assinado",
    ],
  );
  assert.equal(COMMERCIAL_CONTRACT_STAGES.at(-1)?.terminal, true);
  assert.equal(commercialContractStageName("sent"), "Contrato Enviado");
});

test("the mirrored board derives the same stage from the linked Finance task", () => {
  assert.equal(commercialContractStageFromLead(null), "information");
  assert.equal(
    commercialContractStageFromLead({
      contract_confirmed_at: "2026-08-27T15:35:19.313Z",
      finance_contract_task: { status: "todo" },
    }),
    "preparation",
  );
  assert.equal(
    commercialContractStageFromLead({
      contract_confirmed_at: "2026-08-27T15:35:19.313Z",
      finance_contract_task: { status: "in_progress" },
    }),
    "sent",
  );
  assert.equal(
    commercialContractStageFromLead({
      contract_confirmed_at: "2026-08-27T15:35:19.313Z",
      finance_contract_task: { status: "done" },
    }),
    "signed",
  );
});

test("activity labels use the selected translation and include time", () => {
  const t = (key: string) =>
    key === "activity.event.commercial_contract_signed"
      ? "Contrato Assinado"
      : key;
  assert.equal(
    activityEventLabel("commercial_contract_signed", t),
    "Contrato Assinado",
  );
  assert.match(
    formatActivityDateTime("2026-08-27T14:35:00-03:00", "pt-BR"),
    /27\/08\/2026.*14:35/,
  );
});
