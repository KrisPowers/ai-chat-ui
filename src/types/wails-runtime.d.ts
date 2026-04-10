import type {
  AppSettings,
  ChatRecord,
  PersistedAppSnapshot,
  ProjectFolder,
  ReplyPreferenceRecord,
  WorkspaceSelection,
  WorkspaceSnapshot,
} from './index';

interface WailsAppBridge {
  GetStorageSnapshot(): Promise<Omit<PersistedAppSnapshot, 'storageMode'>>;
  LoadChats(): Promise<ChatRecord[]>;
  SaveChat(chat: ChatRecord): Promise<void>;
  DeleteChat(id: string): Promise<void>;
  DeleteAllChats(): Promise<void>;
  SaveAppSettings(settings: AppSettings): Promise<void>;
  SaveWorkspaces(workspaces: ProjectFolder[]): Promise<void>;
  LoadReplyPreferences(): Promise<ReplyPreferenceRecord[]>;
  ReplaceReplyPreferences(preferences: ReplyPreferenceRecord[]): Promise<void>;
  SeedFromBrowser(snapshot: Omit<PersistedAppSnapshot, 'storageMode'>): Promise<boolean>;
  PickWorkspaceDirectory(): Promise<WorkspaceSelection>;
  ScanWorkspace(rootPath: string): Promise<WorkspaceSnapshot>;
  OpenWorkspaceInExplorer(rootPath: string): Promise<void>;
  CreateWorkspaceDirectory(rootPath: string, relativePath: string): Promise<WorkspaceSnapshot>;
  CreateWorkspaceFile(rootPath: string, relativePath: string, content: string): Promise<WorkspaceSnapshot>;
  WriteWorkspaceFile(rootPath: string, relativePath: string, content: string): Promise<WorkspaceSnapshot>;
  DeleteWorkspaceEntry(rootPath: string, relativePath: string): Promise<WorkspaceSnapshot>;
}

declare global {
  interface Window {
    go?: {
      main?: {
        App?: WailsAppBridge;
      };
    };
  }
}

export {};
