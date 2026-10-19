export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  almGetProfiles?: () => Promise<unknown>;
  almLoadConnections: () => Promise<AlmLoadResult>;
  almTestConnection: (input: AlmConnectionInput) => Promise<AlmTestResult>;
  almSaveConnection: (input: AlmConnectionInput) => Promise<AlmSaveResult>;
  almDeleteConnection: (id: string) => Promise<AlmDeleteResult>;
  createTerminal: (options?: { cwd?: string; cols?: number; rows?: number }) => Promise<{
    success?: boolean;
    shell?: string;
    cwd?: string;
    pid?: number;
    error?: string;
  }>;
  writeTerminal: (data: string) => void;
  resizeTerminal: (cols: number, rows: number) => void;
  killTerminal: () => void;
  onTerminalData: (callback: (data: string) => void) => () => void;
  onTerminalExit: (callback: (data: { exitCode: number; signal?: number }) => void) => () => void;
}

export type AlmPlatform = "azure-devops" | "jira";

export interface AlmConnectionInput {
  id?: string;
  platform: AlmPlatform;
  name: string;
  baseUrl: string;
  token: string;
}

export interface AlmConnectionMetadata {
  id: string;
  platform: AlmPlatform;
  name: string;
  baseUrl: string;
  hasToken: boolean;
  updatedAt: string;
}

export interface AlmLoadResult {
  success: boolean;
  connections: AlmConnectionMetadata[];
  error?: string;
}

export interface AlmTestResult {
  success: boolean;
  readAccess: boolean;
  writeAccess: boolean;
  message: string;
}

export interface AlmSaveResult {
  success: boolean;
  connection?: AlmConnectionMetadata;
  error?: string;
}

export interface AlmDeleteResult {
  success: boolean;
  error?: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
