import { prisma } from "@/lib/prisma";
import {
  consumeStoredActionApproval,
  createStoredActionApproval,
  finishStoredActionApproval,
} from "./action-authorization-store-core";
import type { ActionAuthorizationInput } from "@/lib/action-authorization";

export function createActionApproval(input: ActionAuthorizationInput) {
  return createStoredActionApproval(prisma, input);
}

export function consumeActionApproval(id: string, input: ActionAuthorizationInput) {
  return consumeStoredActionApproval(prisma, id, input);
}

export function finishActionApproval(
  id: string,
  result: { status: "COMPLETED" | "FAILED" | "UNKNOWN"; summary?: string; error?: string },
) {
  return finishStoredActionApproval(prisma, id, result);
}
