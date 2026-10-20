import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createActionContextReferences,
  createActionProposal,
  decodeActionAudit,
  encodeActionAudit,
  isAllowedAgentActionRecord,
  transitionActionStatus,
  validateActionContextDocument,
  validateActionContextRequest,
  validateActionContextSelections,
} from "../../src/lib/action-context.ts";
import {
  actionContentHash,
  isActionApprovalUsable,
} from "../../src/lib/action-authorization.ts";
import { redactSecretsFromText } from "../../src/lib/secret-redaction.ts";
import {
  proposalApprovalMatchesContent,
  proposalContentHash,
  reviewsApproveCurrentProposal,
} from "../../src/lib/proposal-approval.ts";

test("validates unique Markdown purpose selections and rejects unknown purposes", () => {
  assert.deepEqual(
    validateActionContextSelections([
      { documentId: "doc-1", purpose: "procedure" },
      { documentId: "doc-2", purpose: "work-data" },
    ]),
    [
      { documentId: "doc-1", purpose: "procedure" },
      { documentId: "doc-2", purpose: "work-data" },
    ],
  );
  assert.throws(
    () => validateActionContextSelections([{ documentId: "doc-1", purpose: "execute" }]),
    /no es válida/,
  );
  assert.throws(
    () => validateActionContextSelections(Array.from({ length: 5 }, (_, index) => ({
      documentId: `doc-${index}`,
      purpose: "procedure",
    }))),
    /cuatro fuentes/,
  );
});

test("builds a local-only action proposal and enforces lifecycle transitions", async () => {
  const selections = [{ documentId: "doc-1", purpose: "procedure" }];
  const references = await createActionContextReferences(selections, [{
    id: "doc-1",
    title: "qa/procedure.md",
    markdownContent: "# Validación\nVerifica el resultado esperado.",
  }]);
  assert.match(references[0].sha256, /^[a-f0-9]{64}$/);

  const proposal = createActionProposal({
    now: new Date("2026-10-30T00:00:00.000Z"),
    inputs: {
      storyReference: "US-42",
      storyDescription: "",
      categories: ["manual"],
      provider: "ollama",
      model: "qwen2.5-coder:3b",
    },
    contexts: references,
  });
  assert.equal(proposal.authorization, "not-required-local-only");
  assert.equal(transitionActionStatus(proposal, "validation_pending").status, "validation_pending");
  assert.throws(() => transitionActionStatus(proposal, "approved"), /Transición de acción no permitida/);
  assert.equal(
    transitionActionStatus(
      transitionActionStatus(proposal, "validation_pending"),
      "cancelled",
    ).status,
    "cancelled",
  );
  assert.equal(
    transitionActionStatus(
      transitionActionStatus(proposal, "validation_pending"),
      "failed",
    ).status,
    "failed",
  );
  assert.notEqual(
    references[0].sha256,
    (await createActionContextReferences(selections, [{
      id: "doc-1",
      title: "qa/procedure.md",
      markdownContent: "# Validación\nCriterio modificado.",
    }]))[0].sha256,
  );
});

test("requires valid, unchanged Markdown selections and only records draft lifecycle states", async () => {
  const markdown = "# QA\nCriterios de aceptación.";
  const [{ sha256 }] = await createActionContextReferences(
    [{ documentId: "doc-1", purpose: "procedure" }],
    [{ id: "doc-1", title: "qa.md", markdownContent: markdown }],
  );
  assert.deepEqual(
    validateActionContextRequest([{ documentId: "doc-1", purpose: "procedure", sha256 }]),
    [{ documentId: "doc-1", purpose: "procedure", sha256 }],
  );
  assert.throws(
    () => validateActionContextRequest([{ documentId: "doc-1", purpose: "procedure", sha256: "invalid" }]),
    /no es válida/,
  );
  await assert.rejects(
    createActionContextReferences(
      [{ documentId: "doc-1", purpose: "work-data" }],
      [{ id: "doc-1", title: "qa.md", markdownContent: " \n " }],
    ),
    /vacía/,
  );
  await assert.rejects(
    createActionContextReferences(
      [{ documentId: "doc-1", purpose: "work-data" }],
      [{ id: "doc-1", title: "qa.txt", markdownContent: markdown }],
    ),
    /no es Markdown/,
  );

  const testCases = [{
    title: "Caso QA",
    category: "manual",
    gherkin: "Given a user\nWhen submits\nThen success",
    steps: [{ step: "Submit", expectedResult: "Success" }],
  }];
  assert.equal(isAllowedAgentActionRecord("GENERATED", "DRAFT", testCases), true);
  assert.equal(isAllowedAgentActionRecord("GENERATED", "FAILED", []), true);
  assert.equal(isAllowedAgentActionRecord("GENERATED", "CANCELLED", []), true);
  assert.equal(isAllowedAgentActionRecord("GENERATED", "APPROVED", testCases), false);
  assert.equal(isAllowedAgentActionRecord("GENERATED", "SYNCED", testCases), false);
  assert.equal(isAllowedAgentActionRecord("APPROVE_SYNC", "APPROVED", testCases), false);
  assert.equal(isAllowedAgentActionRecord("GENERATED", "DRAFT", [{ ...testCases[0], title: "" }]), false);
  assert.equal(validateActionContextDocument({
    title: "qa.md",
    sourceType: "md",
    markdownContent: markdown,
  }), true);
  assert.equal(validateActionContextDocument({
    title: "qa.md",
    sourceType: "pdf",
    markdownContent: markdown,
  }), false);
});

test("round-trips action context audit and preserves legacy history text", () => {
  const reference = {
    documentId: "doc-1",
    purpose: "work-data",
    title: "qa/cases.md",
    sha256: "a".repeat(64),
  };
  assert.deepEqual(
    decodeActionAudit(encodeActionAudit("Borrador local.", [reference])),
    { summary: "Borrador local.", contextReferences: [reference] },
  );
  assert.deepEqual(
    decodeActionAudit("Sincronización histórica previa."),
    { summary: "Sincronización histórica previa.", contextReferences: [] },
  );
});

test("binds a one-time approval to operation, target, exact payload, and expiry", () => {
  const approvedAction = {
    operation: "runner:playwright",
    target: "/workspace/project",
    payload: { testPath: "tests/smoke.spec.ts" },
  };
  const approval = {
    ...approvedAction,
    contentHash: actionContentHash(approvedAction),
    status: "APPROVED",
    expiresAt: new Date("2026-10-30T00:02:00.000Z"),
  };
  const now = new Date("2026-10-30T00:01:00.000Z");
  assert.equal(isActionApprovalUsable(approval, approvedAction, now), true);
  assert.equal(isActionApprovalUsable(approval, {
    ...approvedAction,
    operation: "runner:build",
  }, now), false);
  assert.equal(isActionApprovalUsable(approval, {
    ...approvedAction,
    target: "/workspace/other",
  }, now), false);
  assert.equal(isActionApprovalUsable(approval, {
    ...approvedAction,
    payload: { testPath: "tests/other.spec.ts" },
  }, now), false);
  assert.equal(isActionApprovalUsable({ ...approval, status: "RUNNING" }, approvedAction, now), false);
  assert.equal(isActionApprovalUsable(approval, approvedAction, new Date("2026-10-30T00:02:00.000Z")), false);
  assert.equal(actionContentHash({
    ...approvedAction,
    payload: { testPath: "tests/smoke.spec.ts", options: { b: 2, a: 1 } },
  }), actionContentHash({
    ...approvedAction,
    payload: { options: { a: 1, b: 2 }, testPath: "tests/smoke.spec.ts" },
  }));
});

test("redacts configured secret values from persisted and returned output", () => {
  const value = "Authorization: token-12345 and token-12345-long";
  const redacted = redactSecretsFromText(value, ["token-12345", "token-12345-long"]);
  assert.equal(redacted, "Authorization: [REDACTED] and [REDACTED]");
  assert.doesNotMatch(redacted, /token-12345/);
});

test("invalidates proposal reviews and approvals when title or diff content changes", () => {
  const title = "QA change";
  const diff = "--- a/file.ts\n+++ b/file.ts\n+approved change\n";
  const hash = proposalContentHash(title, diff);
  const reviews = {
    arquitecto: { verdict: "approved", contentHash: hash },
    juez: { verdict: "approved", contentHash: hash },
  };
  assert.equal(reviewsApproveCurrentProposal(reviews, title, diff), true);
  assert.equal(proposalApprovalMatchesContent(hash, title, diff), true);
  assert.equal(reviewsApproveCurrentProposal(reviews, title, `${diff}+later change\n`), false);
  assert.equal(proposalApprovalMatchesContent(hash, `${title} changed`, diff), false);
  assert.equal(reviewsApproveCurrentProposal({
    ...reviews,
    juez: { verdict: "approved" },
  }, title, diff), false);
});
