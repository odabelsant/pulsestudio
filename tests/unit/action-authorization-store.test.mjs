import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consumeStoredActionApproval,
  createStoredActionApproval,
  finishStoredActionApproval,
} from "../../src/lib/action-authorization-store-core.ts";

function createApprovalDelegate() {
  const rows = new Map();
  return {
    rows,
    actionApproval: {
      async create({ data }) {
        const row = {
          ...data,
          startedAt: null,
          completedAt: null,
          resultSummary: null,
          errorSummary: null,
        };
        rows.set(row.id, row);
        return row;
      },
      async findUnique({ where }) {
        return rows.get(where.id) ?? null;
      },
      async updateMany({ where, data }) {
        const row = rows.get(where.id);
        if (!row || row.status !== where.status) return { count: 0 };
        if (where.operation && row.operation !== where.operation) return { count: 0 };
        if (where.target && row.target !== where.target) return { count: 0 };
        if (where.contentHash && row.contentHash !== where.contentHash) return { count: 0 };
        if (where.expiresAt && row.expiresAt <= where.expiresAt.gt) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
}

test("stores an approval bound to exact content and consumes it once", async () => {
  const store = createApprovalDelegate();
  const action = {
    operation: "runner.execute",
    target: "/isolated/workspace",
    payload: { job: "typecheck", testPath: null },
  };
  const approval = await createStoredActionApproval(store, action);
  assert.match(approval.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(await consumeStoredActionApproval(store, approval.id, {
    ...action,
    payload: { job: "build", testPath: null },
  }), false);
  assert.equal(await consumeStoredActionApproval(store, approval.id, action), true);
  assert.equal(await consumeStoredActionApproval(store, approval.id, action), false);
  assert.equal(await finishStoredActionApproval(store, approval.id, {
    status: "COMPLETED",
    summary: "The Runner completed.",
  }), true);
  assert.equal(await finishStoredActionApproval(store, approval.id, {
    status: "FAILED",
  }), false);
  assert.equal(store.rows.get(approval.id).status, "COMPLETED");
});
