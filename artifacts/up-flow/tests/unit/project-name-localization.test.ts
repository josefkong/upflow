import assert from "node:assert/strict";
import test from "node:test";

import {
  localizeProjectDescription,
  localizeProjectName,
  localizeSpaceName,
} from "../../src/lib/i18n/project-name-translations";

test("localizes known system project names into Brazilian Portuguese", () => {
  assert.equal(localizeProjectName("Contracts", "pt-BR"), "Contratos");
  assert.equal(
    localizeProjectName("Contracts & Handoffs", "pt-BR"),
    "Contratos e Handoffs",
  );
  assert.equal(localizeProjectName("Proposals", "pt-BR"), "Propostas");
  assert.equal(localizeProjectName("Campaigns", "pt-BR"), "Campanhas");
  assert.equal(localizeProjectName("Invoices", "pt-BR"), "Faturas");
});

test("keeps established marketing terms unchanged", () => {
  assert.equal(localizeProjectName("Follow-ups", "pt-BR"), "Follow Up");
  assert.equal(localizeProjectName("Follow-up", "en"), "Follow Up");
  assert.equal(localizeProjectName("Follow Up", "pt-BR"), "Follow Up");
  assert.equal(localizeProjectName("Leads", "pt-BR"), "Leads");
});

test("supports switching a localized system name back to English", () => {
  assert.equal(localizeProjectName("Contratos", "en"), "Contracts");
  assert.equal(
    localizeProjectName("Contratos e Handoffs", "en"),
    "Contracts & Handoffs",
  );
});

test("does not modify custom project names", () => {
  assert.equal(localizeProjectName("Projeto Josef", "pt-BR"), "Projeto Josef");
  assert.equal(localizeProjectName("Projeto Josef", "en"), "Projeto Josef");
});

test("localizes the Contracts and Handoffs system description", () => {
  const englishDescription =
    "Reusable queue for client contracts, handoffs, and onboarding commercial checks.";
  const portugueseDescription =
    "Fila reutilizável para contratos de clientes, handoffs e verificações do onboarding comercial.";

  assert.equal(
    localizeProjectDescription(
      "Contracts & Handoffs",
      englishDescription,
      "pt-BR",
    ),
    portugueseDescription,
  );
  assert.equal(
    localizeProjectDescription(
      "Contratos e Handoffs",
      portugueseDescription,
      "en",
    ),
    englishDescription,
  );
});

test("preserves a customized project description", () => {
  assert.equal(
    localizeProjectDescription(
      "Contratos e Handoffs",
      "Descrição criada pelo usuário.",
      "en",
    ),
    "Descrição criada pelo usuário.",
  );
});

test("localizes canonical department Space names without changing custom names", () => {
  assert.equal(localizeSpaceName("Finance", "pt-BR"), "Financeiro");
  assert.equal(localizeSpaceName("Production", "pt-BR"), "Produção");
  assert.equal(
    localizeSpaceName("General Admin", "pt-BR"),
    "Administração Geral",
  );
  assert.equal(
    localizeSpaceName("Technical Support", "pt-BR"),
    "Suporte Técnico",
  );
  assert.equal(localizeSpaceName("Financeiro", "en"), "Finance");
  assert.equal(localizeSpaceName("Espaço Josef", "pt-BR"), "Espaço Josef");
});
