import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  proposalApprovalMatchesContent,
  proposalContentHash,
  reviewsApproveCurrentProposal,
} from "@/lib/proposal-approval";

export type ReviewRole = "arquitecto" | "juez";
type Review = {
  verdict: "approved" | "changes_requested";
  notes: string;
  at: string;
  contentHash: string;
};

export type Proposal = {
  id: string;
  title: string;
  diff: string;
  reviews: Partial<Record<ReviewRole, Review>>;
  humanApproval?: string | null;
  approvedDiffHash?: string | null;
  approvedAt?: Date | null;
  checkpoint?: string | null;
  branch?: string | null;
  applied?: boolean;
  published?: boolean;
};

async function getProposal(id: string): Promise<Proposal | null> {
  const found = await prisma.proposal.findUnique({ where: { id } });
  if (!found) return null;
  return {
    id: found.id,
    title: found.title,
    diff: found.diff,
    reviews: found.reviews ? JSON.parse(found.reviews) : {},
    humanApproval: found.humanApproval,
    approvedDiffHash: found.approvedDiffHash,
    approvedAt: found.approvedAt,
    checkpoint: found.checkpoint,
    branch: found.branch,
    applied: found.applied,
    published: found.published,
  };
}

async function persistProposal(proposal: Proposal) {
  await prisma.proposal.upsert({
    where: { id: proposal.id },
    create: {
      id: proposal.id,
      title: proposal.title,
      diff: proposal.diff,
      reviews: JSON.stringify(proposal.reviews),
      humanApproval: proposal.humanApproval,
      approvedDiffHash: proposal.approvedDiffHash,
      approvedAt: proposal.approvedAt,
      checkpoint: proposal.checkpoint,
      branch: proposal.branch,
      applied: proposal.applied ?? false,
      published: proposal.published ?? false,
    },
    update: {
      title: proposal.title,
      diff: proposal.diff,
      reviews: JSON.stringify(proposal.reviews),
      humanApproval: proposal.humanApproval,
      approvedDiffHash: proposal.approvedDiffHash,
      approvedAt: proposal.approvedAt,
      checkpoint: proposal.checkpoint,
      branch: proposal.branch,
      applied: proposal.applied ?? false,
      published: proposal.published ?? false,
    },
  });
}

export async function createProposal(title: string, diff: string) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("La propuesta necesita título.");
  if (!diff.trim() || diff.length > 1_000_000) {
    throw new Error("El diff debe contener texto y no superar 1 MB.");
  }
  const value: Proposal = {
    id: randomUUID(),
    title: cleanTitle,
    diff,
    reviews: {},
  };
  await persistProposal(value);
  return value;
}

export function proposal(id: string) {
  return getProposal(id);
}

export async function review(
  id: string,
  role: ReviewRole,
  verdict: Review["verdict"],
  notes: string,
) {
  if (role !== "arquitecto" && role !== "juez") throw new Error("El rol de revisión no es válido.");
  if (verdict !== "approved" && verdict !== "changes_requested") {
    throw new Error("El resultado de revisión no es válido.");
  }
  const value = await getProposal(id);
  if (!value) throw new Error("Propuesta no encontrada o reiniciada.");
  const currentHash = proposalContentHash(value.title, value.diff);
  value.reviews[role] = {
    verdict,
    notes: notes.trim().slice(0, 10_000),
    at: new Date().toISOString(),
    contentHash: currentHash,
  };
  value.humanApproval = null;
  value.approvedDiffHash = null;
  value.approvedAt = null;
  await persistProposal(value);
  return value;
}

export async function approve(id: string, person: string) {
  const value = await getProposal(id);
  if (!value) throw new Error("Propuesta no encontrada o reiniciada.");
  if (!person.trim()) throw new Error("Indica quién aprueba.");
  const contentHash = proposalContentHash(value.title, value.diff);
  if (!reviewsApproveCurrentProposal(value.reviews, value.title, value.diff)) {
    throw new Error("Arquitecto y Juez deben aprobar primero el contenido actual.");
  }
  value.humanApproval = person.trim().slice(0, 200);
  value.approvedDiffHash = contentHash;
  value.approvedAt = new Date();
  await persistProposal(value);
  return value;
}

export async function apply(id: string) {
  const value = await getProposal(id);
  if (!value) throw new Error("Propuesta no encontrada o reiniciada.");
  if (
    !value.humanApproval ||
    !value.approvedAt ||
    !proposalApprovalMatchesContent(value.approvedDiffHash, value.title, value.diff)
  ) {
    throw new Error("La propuesta no tiene una aprobación vigente para su contenido exacto.");
  }
  throw new Error("La aplicación del diff no está implementada; no se registró como aplicada.");
}

export async function rollback(id: string) {
  const value = await getProposal(id);
  if (!value) throw new Error("Propuesta no encontrada o reiniciada.");
  if (!value.applied) throw new Error("La propuesta no está aplicada.");
  throw new Error("La reversión del diff no está implementada; el estado no se modificó.");
}

export async function publish(id: string) {
  const value = await getProposal(id);
  if (!value) throw new Error("Propuesta no encontrada o reiniciada.");
  if (!value.applied || !value.branch) throw new Error("Aplica la propuesta antes de publicar.");
  throw new Error("La publicación externa no está implementada; no se marcó como publicada.");
}
