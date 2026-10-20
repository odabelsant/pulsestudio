import { actionContentHash } from "./action-authorization.ts";

export interface ProposalReviewSnapshot {
  verdict: string;
  contentHash?: string;
}

export function proposalContentHash(title: string, diff: string): string {
  return actionContentHash({
    operation: "proposal.apply",
    target: "local-workspace",
    payload: { title, diff },
  });
}

export function reviewsApproveCurrentProposal(
  reviews: Partial<Record<"arquitecto" | "juez", ProposalReviewSnapshot>>,
  title: string,
  diff: string,
): boolean {
  const contentHash = proposalContentHash(title, diff);
  return (["arquitecto", "juez"] as const).every((role) =>
    reviews[role]?.verdict === "approved" &&
    reviews[role]?.contentHash === contentHash
  );
}

export function proposalApprovalMatchesContent(
  approvedDiffHash: string | null | undefined,
  title: string,
  diff: string,
): boolean {
  return Boolean(approvedDiffHash) && approvedDiffHash === proposalContentHash(title, diff);
}
