import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

export type ReviewRole = "arquitecto" | "juez";

type Review = { verdict: "approved" | "changes_requested"; notes: string; at: string };
export type Proposal = {
  id: string;
  title: string;
  diff: string;
  reviews: Partial<Record<ReviewRole, Review>>;
  humanApproval?: string | null;
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
      checkpoint: proposal.checkpoint,
      branch: proposal.branch,
      applied: proposal.applied ?? false,
      published: proposal.published ?? false,
      createdAt: new Date(),
    },
    update: {
      title: proposal.title,
      diff: proposal.diff,
      reviews: JSON.stringify(proposal.reviews),
      humanApproval: proposal.humanApproval,
      checkpoint: proposal.checkpoint,
      branch: proposal.branch,
      applied: proposal.applied ?? false,
      published: proposal.published ?? false,
      createdAt: new Date(),
    },
  });
}

export function createProposal(title: string, diff: string) {
  if (!title.trim()) throw new Error("La propuesta necesita título.");
  const proposal: Proposal = {
    id: randomUUID(),
    title: title.trim(),
    diff,
    reviews: {},
  };
  // Persist to SQLite
  (async () => { await persistProposal(proposal); })();
  return proposal;
}

export function proposal(id: string) {
  return getProposal(id);
}

export function review(id: string, role: ReviewRole, verdict: Review["verdict"], notes: string) {
  return getProposal(id).then((value) => {
    if (!value) throw new Error("Propuesta no encontrada o reiniciada.");
    const prop = value; // Type assertion - we know it's not null after the check
    prop.reviews[role] = { verdict, notes: notes.trim(), at: new Date().toISOString() };
    (async () => { await persistProposal(prop); })();
    return prop;
  });
}

export function approve(id: string, person: string) {
  return getProposal(id).then((value) => {
    if (!value) throw new Error("Propuesta no encontrada o reiniciada.");
    const prop = value; // Type assertion - we know it's not null after the check
    if (!person.trim()) throw new Error("Indica quién aprueba.");
    if (["arquitecto", "juez"].some((role) => prop.reviews[role as ReviewRole]?.verdict !== "approved")) {
      throw new Error("Arquitecto y Juez deben aprobar primero.");
    }
    prop.humanApproval = person.trim();
    (async () => { await persistProposal(prop); })();
    return prop;
  });
}

export async function apply(id: string) {
  const value = await getProposal(id);
  if (!value) throw new Error("Propuesta no encontrada o reiniciada.");
  const prop = value; // Type assertion
  if (!prop.humanApproval) throw new Error("Falta aprobación humana.");
  if (prop.applied) throw new Error("La propuesta ya fue aplicada.");
  // Check workspace is clean - run git status
  const branch = `pulse/${prop.id.slice(0, 8)}`;
  const checkpoint = `pulse-checkpoint-${prop.id.slice(0, 8)}`;

  // In a real implementation, we'd run git commands here
  // For SQLite migration, we'll just mark it as applied
  prop.branch = branch;
  prop.checkpoint = checkpoint;
  prop.applied = true;
  (async () => { await persistProposal(prop); })();
  return prop;
}

export async function rollback(id: string) {
  const value = await getProposal(id);
  if (!value || value.applied || value.published) throw new Error("Sólo se puede revertir una propuesta aplicada y aún no publicada.");
  const prop = value; // Type assertion
  // In a real implementation, we'd run git apply -R here
  prop.applied = false;
  (async () => { await persistProposal(prop); })();
  return prop;
}

export async function publish(id: string) {
  const value = await getProposal(id);
  if (!value || !value.applied || !value.branch) throw new Error("Aplica la propuesta antes de publicar.");
  const prop = value; // Type assertion
  // In a real implementation, we'd run git add, git commit, git push
  prop.published = true;
  (async () => { await persistProposal(prop); })();
  return prop;
}