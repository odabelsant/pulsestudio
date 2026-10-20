import assert from "node:assert/strict";
import { test } from "node:test";
import { readBoundedJson } from "../../src/lib/bounded-json.ts";
import { actionContentHash } from "../../src/lib/action-authorization.ts";
import {
  normalizeBugInput,
  normalizeRequirementInput,
  normalizeTestCaseInput,
  normalizeTestPlanInput,
  normalizeTestSuiteInput,
  QaValidationError,
} from "../../src/lib/qa-domain.ts";
import {
  matchesQaTestCaseSource,
  normalizeQaTestCaseImport,
  qaTestCaseImportAuthorization,
} from "../../src/lib/qa-test-case-import.ts";

const validTestCase = {
  title: "Validar inicio de sesión",
  category: "manual",
  gherkin: "Given an existing user\nWhen valid credentials are submitted\nThen access is granted",
  steps: [{ step: "Enviar credenciales válidas", expectedResult: "Se abre la página principal" }],
  requirementIds: [],
};

test("reads QA request JSON with a byte limit, including requests without content-length", async () => {
  const withinLimit = new Request("http://localhost/api/qa/test-cases", {
    method: "POST",
    body: JSON.stringify({ title: "Caso local" }),
  });
  assert.deepEqual(await readBoundedJson(withinLimit, 64), {
    ok: true,
    value: { title: "Caso local" },
  });

  const oversized = new Request("http://localhost/api/qa/test-cases", {
    method: "POST",
    body: JSON.stringify({ title: "x".repeat(100) }),
  });
  assert.deepEqual(await readBoundedJson(oversized, 64), { ok: false, reason: "too-large" });

  const invalid = new Request("http://localhost/api/qa/test-cases", {
    method: "POST",
    body: "{",
  });
  assert.deepEqual(await readBoundedJson(invalid, 64), { ok: false, reason: "invalid" });
});

test("normalizes local requirement, test case, suite, plan, and bug data", () => {
  assert.deepEqual(normalizeRequirementInput({
    title: "Login",
    acceptanceCriteria: ["El usuario puede autenticarse"],
  }), {
    key: null,
    title: "Login",
    description: "",
    acceptanceCriteria: ["El usuario puede autenticarse"],
    status: "DRAFT",
    externalProvider: null,
    externalId: null,
  });
  assert.equal(normalizeTestCaseInput(validTestCase).steps.length, 1);
  assert.deepEqual(normalizeTestSuiteInput({ name: "Smoke", testCaseIds: ["case-1"] }).testCaseIds, ["case-1"]);
  assert.equal(normalizeTestPlanInput({ name: "Release 1", suiteIds: ["suite-1"] }).suiteIds[0], "suite-1");
  assert.equal(normalizeBugInput({ title: "Crash", severity: "HIGH" }).status, "OPEN");
});

test("rejects invalid fields, duplicate relations, empty cases, and inverted plan dates", () => {
  assert.throws(
    () => normalizeRequirementInput({ title: "External", externalId: "123" }),
    QaValidationError,
  );
  assert.throws(
    () => normalizeTestCaseInput({ ...validTestCase, category: "unknown" }),
    QaValidationError,
  );
  assert.throws(
    () => normalizeTestCaseInput({ ...validTestCase, requirementIds: ["r1", "r1"] }),
    QaValidationError,
  );
  assert.throws(
    () => normalizeTestCaseInput({ ...validTestCase, steps: [] }),
    QaValidationError,
  );
  assert.throws(
    () => normalizeTestPlanInput({
      name: "Invalid dates",
      startsAt: "2026-10-20T00:00:00.000Z",
      endsAt: "2026-10-19T00:00:00.000Z",
    }),
    QaValidationError,
  );
  assert.throws(
    () => normalizeBugInput({ title: "Invalid", severity: "EXTREME" }),
    QaValidationError,
  );
});

test("approved Action Agent import authorization binds cases and Markdown fingerprints", () => {
  const context = {
    documentId: "doc-1",
    purpose: "procedure",
    title: "qa-procedure.md",
    sha256: "a".repeat(64),
  };
  const payload = normalizeQaTestCaseImport({
    cases: [validTestCase],
    contextReferences: [context],
    contextNotebookId: "notebook-1",
    sourceActionLogId: "action-log-1",
  });
  const initialHash = actionContentHash(qaTestCaseImportAuthorization(payload));
  const edited = normalizeQaTestCaseImport({
    ...payload,
    cases: [{ ...validTestCase, title: "Changed title" }],
  });
  const changedContext = normalizeQaTestCaseImport({
    ...payload,
    contextReferences: [{ ...context, sha256: "b".repeat(64) }],
  });

  assert.match(initialHash, /^[a-f0-9]{64}$/);
  assert.notEqual(actionContentHash(qaTestCaseImportAuthorization(edited)), initialHash);
  assert.notEqual(actionContentHash(qaTestCaseImportAuthorization(changedContext)), initialHash);
  assert.throws(
    () => normalizeQaTestCaseImport({ cases: [validTestCase] }),
    /registro de generación/,
  );
  assert.throws(
    () => normalizeQaTestCaseImport({
      cases: [validTestCase],
      contextReferences: [context],
      sourceActionLogId: "action-log-1",
    }),
    /cuaderno activo/,
  );
});

test("requires imported cases and context to match the exact Action Agent draft", () => {
  const context = {
    documentId: "doc-1",
    purpose: "procedure",
    title: "qa-procedure.md",
    sha256: "a".repeat(64),
  };
  const payload = normalizeQaTestCaseImport({
    cases: [validTestCase],
    contextReferences: [context],
    contextNotebookId: "notebook-1",
    sourceActionLogId: "action-log-1",
  });
  const sourceCases = JSON.stringify([{
    ...validTestCase,
    id: "generated-case-1",
    steps: validTestCase.steps.map((step, index) => ({ ...step, id: `step-${index}` })),
  }]);

  assert.equal(matchesQaTestCaseSource(sourceCases, [context], payload), true);
  assert.equal(matchesQaTestCaseSource(
    JSON.stringify([{ ...validTestCase, title: "Different content" }]),
    [context],
    payload,
  ), false);
  assert.equal(matchesQaTestCaseSource(sourceCases, [], payload), false);
});
