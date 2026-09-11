import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import {
  ACTION_TITLE_KEYS,
  formatActionTranslation,
  titleCaseActionLabel,
} from "../../src/lib/i18n/action-title-case";
import { translations } from "../../src/lib/i18n/translations";

const ROOT = join(__dirname, "..", "..");
const NON_ACTION_COPY_SUFFIX =
  /(?:description|subtitle|body|hint|placeholder|confirm|error|empty|unavailable|loading|failed|failure|success|helper|instruction|caption|eyebrow|summary|warning|notice|message|meta|detail)$/i;
const NON_ACTION_COPY_KEYS = new Set([
  "dashboard.membersWithSignals",
  "dashboard.traceableRecords",
]);

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(absolute);
    return entry.isFile() && absolute.endsWith(".tsx") ? [absolute] : [];
  });
}

function actionTranslationKeys(): Set<string> {
  const keys = new Set<string>();

  for (const file of tsxFiles(join(ROOT, "src"))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    function collectCalls(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text;
        const value = translations["pt-BR"][key];
        const words = value?.match(/[\p{L}\p{N}+-]+/gu) ?? [];
        if (
          value &&
          !NON_ACTION_COPY_SUFFIX.test(key) &&
          !NON_ACTION_COPY_KEYS.has(key) &&
          !/[.!?]$/.test(value) &&
          words.length <= 7
        ) {
          keys.add(key);
        }
      }
      ts.forEachChild(node, collectCalls);
    }

    function visit(node: ts.Node) {
      if (ts.isJsxElement(node)) {
        const tagName = node.openingElement.tagName.getText(source);
        if (/(?:^button$|Button$|Link$)/.test(tagName)) {
          node.children.forEach(collectCalls);
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(source);
  }

  return keys;
}

test("button labels follow localized title casing", () => {
  assert.equal(
    formatActionTranslation("clients.healthCenter", "Central de saúde", "pt-BR"),
    "Central de Saúde",
  );
  assert.equal(
    formatActionTranslation("clients.createStandalone", "Criar cliente", "pt-BR"),
    "Criar Cliente",
  );
  assert.equal(
    formatActionTranslation(
      "clients.startOnboarding",
      "Criar cliente + iniciar onboarding",
      "pt-BR",
    ),
    "Criar Cliente + Iniciar Onboarding",
  );
  assert.equal(
    formatActionTranslation("clients.healthCenter", "Health center", "en"),
    "Health Center",
  );
  assert.equal(titleCaseActionLabel("CENTRAL DE AUDITORIA", "pt-BR"), "CENTRAL DE AUDITORIA");
  assert.equal(
    titleCaseActionLabel("Ver todos os projetos ({count} a mais)", "pt-BR"),
    "Ver Todos os Projetos ({count} a Mais)",
  );
});

test("all statically translated button and action-link labels are registered", () => {
  const missing = [...actionTranslationKeys()].filter(
    (key) => !ACTION_TITLE_KEYS.has(key),
  );

  assert.deepEqual(missing, []);
});
