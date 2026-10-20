import { createHash } from "node:crypto";

export interface ActionAuthorizationInput {
  operation: string;
  target: string;
  payload: unknown;
}

export interface StoredActionApproval {
  operation: string;
  target: string;
  contentHash: string;
  status: string;
  expiresAt: Date | string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

export function actionContentHash(input: ActionAuthorizationInput): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue({
      operation: input.operation,
      target: input.target,
      payload: input.payload,
    })))
    .digest("hex");
}

export function isActionApprovalUsable(
  approval: StoredActionApproval,
  expected: ActionAuthorizationInput,
  now = new Date(),
): boolean {
  const expiresAt = approval.expiresAt instanceof Date
    ? approval.expiresAt
    : new Date(approval.expiresAt);
  return (
    approval.status === "APPROVED" &&
    approval.operation === expected.operation &&
    approval.target === expected.target &&
    /^[a-f0-9]{64}$/.test(approval.contentHash) &&
    approval.contentHash === actionContentHash(expected) &&
    Number.isFinite(expiresAt.getTime()) &&
    expiresAt.getTime() > now.getTime()
  );
}
