export type ActionContextPurpose = "procedure" | "work-data";

export type ActionStatus =
  | "proposed"
  | "validation_pending"
  | "authorization_pending"
  | "approved"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ActionContextSelection {
  documentId: string;
  purpose: ActionContextPurpose;
  sha256: string;
}

export interface ActionContextChoice {
  documentId: string;
  purpose: ActionContextPurpose;
}

export interface ActionContextReference extends ActionContextSelection {
  title: string;
  sha256: string;
}

export interface ActionProposal {
  id: string;
  module: "action-agent";
  objective: "generate-test-cases";
  inputs: {
    storyReference: string;
    storyDescription: string;
    categories: string[];
    provider: "ollama" | "google";
    model: string;
  };
  contexts: ActionContextReference[];
  requiredCapabilities: ["ai.generate-test-cases"];
  authorization: "not-required-local-only";
  status: ActionStatus;
  createdAt: string;
}

export interface ActionAlmConnection {
  id: string;
  platform: "azure-devops" | "jira" | "trello";
  name: string;
  status: "configured" | "needs-credentials";
  capabilities: string[];
}

export interface ActionAlmConnectionsResult {
  success: boolean;
  connections: ActionAlmConnection[];
  error?: string;
}
