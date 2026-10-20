export type ProductivityMetricKind =
  | "created"
  | "updated"
  | "deleted"
  | "approved"
  | "rejected"
  | "exported"
  | "context_uploaded"
  | "agent_step";

export type ProductivityMetricPayload = {
  kind: ProductivityMetricKind;
  entity?: string;
  label?: string;
  count?: number;
};

export function productivityMetricLabel(kind: ProductivityMetricKind): string {
  const labels: Record<ProductivityMetricKind, string> = {
    created: "Creados",
    updated: "Actualizados",
    deleted: "Eliminados",
    approved: "Aprobados",
    rejected: "Rechazados",
    exported: "Exportaciones",
    context_uploaded: "Contextos subidos",
    agent_step: "Pasos del agente",
  };
  return labels[kind];
}
