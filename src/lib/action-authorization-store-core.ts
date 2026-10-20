import { randomUUID } from "node:crypto";
import {
  actionContentHash,
  isActionApprovalUsable,
  type ActionAuthorizationInput,
} from "./action-authorization.ts";

const APPROVAL_LIFETIME_MS = 2 * 60_000;

type ApprovalRow = {
  id: string;
  operation: string;
  target: string;
  contentHash: string;
  status: string;
  approvedAt: Date;
  expiresAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  resultSummary: string | null;
  errorSummary: string | null;
};

interface ActionApprovalClient {
  actionApproval: {
    create(args: {
      data: {
        id: string;
        operation: string;
        target: string;
        contentHash: string;
        status: string;
        approvedAt: Date;
        expiresAt: Date;
      };
      select: {
        id: true;
        operation: true;
        target: true;
        contentHash: true;
        approvedAt: true;
        expiresAt: true;
      };
    }): Promise<Omit<ApprovalRow, "status" | "startedAt" | "completedAt" | "resultSummary" | "errorSummary">>;
    findUnique(args: { where: { id: string } }): Promise<ApprovalRow | null>;
    updateMany(args: {
      where: {
        id: string;
        status: string;
        operation?: string;
        target?: string;
        contentHash?: string;
        expiresAt?: { gt: Date };
      };
      data: {
        status: string;
        startedAt?: Date;
        completedAt?: Date;
        resultSummary?: string | null;
        errorSummary?: string | null;
      };
    }): Promise<{ count: number }>;
  };
}

export async function createStoredActionApproval(
  client: ActionApprovalClient,
  input: ActionAuthorizationInput,
) {
  const now = new Date();
  return client.actionApproval.create({
    data: {
      id: randomUUID(),
      operation: input.operation,
      target: input.target,
      contentHash: actionContentHash(input),
      status: "APPROVED",
      approvedAt: now,
      expiresAt: new Date(now.getTime() + APPROVAL_LIFETIME_MS),
    },
    select: {
      id: true,
      operation: true,
      target: true,
      contentHash: true,
      approvedAt: true,
      expiresAt: true,
    },
  });
}

export async function consumeStoredActionApproval(
  client: ActionApprovalClient,
  id: string,
  input: ActionAuthorizationInput,
) {
  const approval = await client.actionApproval.findUnique({ where: { id } });
  if (!approval || !isActionApprovalUsable(approval, input)) return false;
  const now = new Date();
  const claimed = await client.actionApproval.updateMany({
    where: {
      id,
      status: "APPROVED",
      operation: input.operation,
      target: input.target,
      contentHash: actionContentHash(input),
      expiresAt: { gt: now },
    },
    data: { status: "RUNNING", startedAt: now },
  });
  return claimed.count === 1;
}

export async function finishStoredActionApproval(
  client: ActionApprovalClient,
  id: string,
  result: { status: "COMPLETED" | "FAILED" | "UNKNOWN"; summary?: string; error?: string },
) {
  const updated = await client.actionApproval.updateMany({
    where: { id, status: "RUNNING" },
    data: {
      status: result.status,
      completedAt: new Date(),
      resultSummary: result.summary?.slice(0, 2_000) ?? null,
      errorSummary: result.error?.slice(0, 1_000) ?? null,
    },
  });
  return updated.count === 1;
}
