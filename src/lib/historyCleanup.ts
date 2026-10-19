import { prisma } from "@/lib/prisma";

export interface HistoryCleanupResult {
  cutoffDate: Date;
  chatSessions: number;
  chatMessages: number;
  agentActionLogs: number;
}

let cleanupInFlight: Promise<HistoryCleanupResult> | null = null;
let lastCleanup: HistoryCleanupResult | null = null;
let lastCleanupAt = 0;

export async function cleanupExpiredHistory(): Promise<HistoryCleanupResult> {
  if (cleanupInFlight) return cleanupInFlight;
  if (lastCleanup && Date.now() - lastCleanupAt < 60_000) return lastCleanup;

  const cutoffDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  cleanupInFlight = prisma.$transaction(async (transaction) => {
    const messages = await transaction.chatMessage.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });
    const sessions = await transaction.chatSession.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });
    const actionLogs = await transaction.agentActionLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });
    return {
      cutoffDate,
      chatSessions: sessions.count,
      chatMessages: messages.count,
      agentActionLogs: actionLogs.count,
    };
  }).then((result) => {
    lastCleanup = result;
    lastCleanupAt = Date.now();
    return result;
  }).finally(() => {
    cleanupInFlight = null;
  });

  return cleanupInFlight;
}
