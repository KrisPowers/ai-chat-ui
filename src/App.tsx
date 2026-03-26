import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Sidebar } from './components/Sidebar';
import { useOllama } from './hooks/useOllama';
import { useDB } from './hooks/useDB';
import { useToast } from './hooks/useToast';
import { createRegistry, updateRegistry } from './lib/fileRegistry';
import { DEFAULT_PRESET_ID } from './lib/presets';
import { IconFolderPlus, IconHexagon, IconTrash2, IconUpload, IconX } from './components/Icon';
import type { Panel, ChatRecord, ProjectFolder } from './types';
import type { FileRegistry } from './lib/fileRegistry';

const FOLDERS_STORAGE_KEY = 'larry_project_folders_v1';
const DEFAULT_MODEL_STORAGE_KEY = 'larry_default_model_v1';

interface BrowserStorageSnapshot {
  supported: boolean;
  usage?: number;
  quota?: number;
}

function measureStringBytes(value: string): number {
  return new Blob([value]).size;
}

function measureJsonBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return serialized ? measureStringBytes(serialized) : 0;
}

function estimateLocalStorageEntryBytes(key: string, value: string): number {
  return measureStringBytes(key) + measureStringBytes(value);
}

function roundUp(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.ceil(value * factor) / factor;
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? roundUp(kb, 1).toFixed(1) : Math.ceil(kb)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb < 10 ? roundUp(mb, 1).toFixed(1) : Math.ceil(mb)} MB`;
  }

  const gb = bytes / (1024 * 1024 * 1024);
  const roundedGb = roundUp(gb, 1);
  return `${Number.isInteger(roundedGb) ? roundedGb.toFixed(0) : roundedGb.toFixed(1)} GB`;
}

function formatStoragePercent(percent: number): string {
  if (percent <= 0) return '0%';
  if (percent < 0.1) return '0.1%';
  const rounded = roundUp(percent, percent < 10 ? 1 : 0);
  return `${rounded.toFixed(percent < 10 ? 1 : 0)}%`;
}

function buildStorageVisualSegments<T extends { bytes: number }>(buckets: T[]) {
  const activeBuckets = buckets.filter((bucket) => bucket.bytes > 0);
  if (!activeBuckets.length) return [];

  const totalBytes = activeBuckets.reduce((sum, bucket) => sum + bucket.bytes, 0);
  const contributionPercents = activeBuckets.map((bucket) => (bucket.bytes / totalBytes) * 100);
  const minVisualPercent = Math.min(12, 100 / activeBuckets.length);
  const visualPercents = new Array(activeBuckets.length).fill(0);
  const unlocked = new Set(activeBuckets.map((_, index) => index));
  let remainingVisualPercent = 100;
  let remainingContributionPercent = 100;

  let changed = true;
  while (changed && unlocked.size > 0) {
    changed = false;

    for (const index of [...unlocked]) {
      const proportional = remainingContributionPercent > 0
        ? (contributionPercents[index] / remainingContributionPercent) * remainingVisualPercent
        : 0;

      if (proportional < minVisualPercent) {
        visualPercents[index] = minVisualPercent;
        remainingVisualPercent -= minVisualPercent;
        remainingContributionPercent -= contributionPercents[index];
        unlocked.delete(index);
        changed = true;
      }
    }
  }

  if (unlocked.size > 0) {
    for (const index of unlocked) {
      visualPercents[index] = remainingContributionPercent > 0
        ? (contributionPercents[index] / remainingContributionPercent) * remainingVisualPercent
        : remainingVisualPercent / unlocked.size;
    }
  }

  return activeBuckets.map((bucket, index) => ({
    ...bucket,
    contributionPercent: contributionPercents[index],
    visualPercent: visualPercents[index],
  }));
}

function getCustomPresetStorageUsage(): { bytes: number; count: number } {
  try {
    let bytes = 0;
    let count = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || key === DEFAULT_MODEL_STORAGE_KEY || !/preset/i.test(key)) continue;
      const value = localStorage.getItem(key) ?? '';
      bytes += estimateLocalStorageEntryBytes(key, value);
      count += 1;
    }
    return { bytes, count };
  } catch {
    return { bytes: 0, count: 0 };
  }
}

function normaliseProjectId(label: string): string {
  return `project:${label.toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}`;
}

function deriveWorkspaceFromChat(chat: ChatRecord): { id: string; label: string } {
  if (chat.projectId && chat.projectLabel) {
    return { id: chat.projectId, label: chat.projectLabel };
  }

  const entries = chat.fileEntries ?? [];
  if (!entries.length) return { id: 'project:general', label: 'General' };

  const counts = new Map<string, number>();
  for (const entry of entries) {
    const top = entry.path.split('/')[0]?.trim();
    if (!top) continue;
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }

  if (!counts.size) return { id: 'project:general', label: 'General' };

  const [label] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { id: normaliseProjectId(label), label };
}

function restoreRegistry(chatData?: Partial<ChatRecord>): FileRegistry {
  const reg = createRegistry();
  if (!chatData?.fileEntries?.length) return reg;
  return updateRegistry(reg, chatData.fileEntries, 0);
}

function cloneFileEntries(entries?: ChatRecord['fileEntries']) {
  return entries?.map((entry) => ({ ...entry })) ?? [];
}

function entriesFromRegistry(registry: FileRegistry) {
  return [...registry.values()].map((entry) => ({ ...entry }));
}

function registryFromEntries(entries?: ChatRecord['fileEntries']): FileRegistry {
  return new Map(cloneFileEntries(entries).map((entry) => [entry.path, entry]));
}

function newPanel(index: number, defaultModel: string, chatData?: Partial<ChatRecord>): Panel {
  return {
    id: chatData?.id ?? `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: chatData?.title ?? `Chat ${index + 1}`,
    model: chatData?.model ?? defaultModel,
    preset: chatData?.preset ?? DEFAULT_PRESET_ID,
    projectId: chatData?.projectId,
    projectLabel: chatData?.projectLabel,
    messages: chatData?.messages ?? [],
    streaming: false,
    streamingContent: '',
    fileRegistry: restoreRegistry(chatData),
    prevRegistry: new Map(),
    streamingPhase: null,
  };
}

function langFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx',
    py: 'py', html: 'html', css: 'css', scss: 'scss',
    json: 'json', md: 'md', sh: 'sh', bash: 'bash',
    yaml: 'yaml', yml: 'yaml', xml: 'xml', sql: 'sql',
    go: 'go', rs: 'rs', java: 'java', c: 'c', cpp: 'cpp',
  };
  return map[ext] ?? ext ?? 'text';
}

function parseChatLog(md: string, filename: string): ChatRecord | null {
  try {
    const lines = md.split('\n');
    const title = lines[0]?.replace(/^#\s*Chat Log\s*[\u2014\u2013-]\s*/, '').trim() || filename.replace(/\.md$/, '');

    const modelLine = lines.find(l => l.startsWith('**Model:**'));
    const presetLine = lines.find(l => l.startsWith('**Preset:**'));
    const projectLine = lines.find(l => l.startsWith('**Project:**'));
    const model = modelLine ? modelLine.replace(/\*\*Model:\*\*\s*/, '').trim() : '';
    const preset = presetLine ? presetLine.replace(/\*\*Preset:\*\*\s*/, '').trim() : DEFAULT_PRESET_ID;
    const projectLabel = projectLine ? projectLine.replace(/\*\*Project:\*\*\s*/, '').trim() : '';
    const projectId = projectLabel ? normaliseProjectId(projectLabel) : undefined;

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const sections = md.split(/\n---\n/);
    for (const section of sections) {
      const s = section.trim();
      if (s.startsWith('### You')) {
        const content = s.replace(/^###\s+You\s*\n/, '').trim();
        if (content) messages.push({ role: 'user', content });
      } else if (s.startsWith('### Assistant')) {
        const content = s.replace(/^###\s+Assistant\s*\n/, '').trim();
        if (content) messages.push({ role: 'assistant', content });
      }
    }
    if (!messages.length) return null;

    return {
      id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      model,
      preset,
      projectId,
      projectLabel: projectLabel || undefined,
      messages,
      updatedAt: Date.now(),
      fileEntries: [],
    };
  } catch {
    return null;
  }
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
}

export default function App() {
  const { models, status } = useOllama();
  const { chats, ready, save, remove, clearAll } = useDB();
  const { toast } = useToast();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [view, setView] = useState<'chats' | 'settings'>('chats');
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);
  const [defaultModel, setDefaultModel] = useState('');
  const [browserStorage, setBrowserStorage] = useState<BrowserStorageSnapshot>({
    supported: true,
  });
  const [hoveredStorageBucketId, setHoveredStorageBucketId] = useState<string | null>(null);
  const storagePopupHideTimeoutRef = useRef<number | null>(null);
  const importLogsSettingsRef = useRef<HTMLInputElement>(null);
  const importWorkspaceLauncherRef = useRef<HTMLInputElement>(null);
  const [workspaceLauncherOpen, setWorkspaceLauncherOpen] = useState(false);
  const [workspaceLauncherMode, setWorkspaceLauncherMode] = useState<'create' | 'import'>(
    'create',
  );
  const [workspaceDraftName, setWorkspaceDraftName] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const resolvedDefaultModel =
    defaultModel && models.includes(defaultModel) ? defaultModel : models[0] ?? '';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ProjectFolder[];
      if (Array.isArray(parsed)) setProjectFolders(parsed);
    } catch {
      // ignore malformed local cache
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DEFAULT_MODEL_STORAGE_KEY);
      if (raw) setDefaultModel(raw);
    } catch {
      // ignore malformed local cache
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(projectFolders));
  }, [projectFolders]);

  useEffect(() => {
    if (defaultModel) {
      localStorage.setItem(DEFAULT_MODEL_STORAGE_KEY, defaultModel);
    }
  }, [defaultModel]);

  useEffect(() => {
    let cancelled = false;

    async function loadBrowserStorageEstimate() {
      if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
        if (!cancelled) setBrowserStorage({ supported: false });
        return;
      }

      try {
        const estimate = await navigator.storage.estimate();
        if (!cancelled) {
          setBrowserStorage({
            supported: true,
            usage: estimate.usage,
            quota: estimate.quota,
          });
        }
      } catch {
        if (!cancelled) setBrowserStorage({ supported: false });
      }
    }

    void loadBrowserStorageEstimate();
    return () => {
      cancelled = true;
    };
  }, [chats, projectFolders, defaultModel]);

  useEffect(() => {
    if (!workspaceLauncherOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWorkspaceLauncherOpen(false);
        setWorkspaceLauncherMode('create');
        setWorkspaceDraftName('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workspaceLauncherOpen]);

  useEffect(() => () => {
    if (storagePopupHideTimeoutRef.current != null) {
      window.clearTimeout(storagePopupHideTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!confirmDialog || confirmBusy) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmDialog(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmBusy, confirmDialog]);

  const closeWorkspaceLauncher = useCallback(() => {
    setWorkspaceLauncherOpen(false);
    setWorkspaceLauncherMode('create');
    setWorkspaceDraftName('');
  }, []);

  const openWorkspaceLauncher = useCallback((mode: 'create' | 'import' = 'create') => {
    setView('chats');
    setWorkspaceLauncherMode(mode);
    setWorkspaceDraftName('');
    setWorkspaceLauncherOpen(true);
  }, []);

  const requestConfirmation = useCallback((dialog: ConfirmDialogState) => {
    setConfirmDialog(dialog);
  }, []);

  const closeConfirmDialog = useCallback(() => {
    if (confirmBusy) return;
    setConfirmDialog(null);
  }, [confirmBusy]);

  const cancelStoragePopupHide = useCallback(() => {
    if (storagePopupHideTimeoutRef.current != null) {
      window.clearTimeout(storagePopupHideTimeoutRef.current);
      storagePopupHideTimeoutRef.current = null;
    }
  }, []);

  const scheduleStoragePopupHide = useCallback(() => {
    cancelStoragePopupHide();
    storagePopupHideTimeoutRef.current = window.setTimeout(() => {
      setHoveredStorageBucketId(null);
      storagePopupHideTimeoutRef.current = null;
    }, 110);
  }, [cancelStoragePopupHide]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } finally {
      setConfirmBusy(false);
    }
  }, [confirmDialog]);

  const createPanel = useCallback((chatData?: Partial<ChatRecord>) => {
    setPanels((prev) => {
      if (prev.length >= 3) {
        toast('Max 3 panels open at once.');
        return prev;
      }
      const nextPanel = newPanel(prev.length, resolvedDefaultModel, chatData);
      setActivePanelId(nextPanel.id);
      return [...prev, nextPanel];
    });
  }, [resolvedDefaultModel, toast]);

  const upsertProjectFolder = useCallback((folder: {
    id: string;
    label: string;
    createdAt?: number;
    fileEntries?: ProjectFolder['fileEntries'];
  }) => {
    setProjectFolders((prev) => {
      const nextEntries = folder.fileEntries ? cloneFileEntries(folder.fileEntries) : undefined;
      const existing = prev.find((candidate) => candidate.id === folder.id);
      if (!existing) {
        return [
          ...prev,
          {
            id: folder.id,
            label: folder.label,
            createdAt: folder.createdAt ?? Date.now(),
            fileEntries: nextEntries,
          },
        ];
      }

      return prev.map((candidate) => {
        if (candidate.id !== folder.id) return candidate;
        return {
          ...candidate,
          label: folder.label,
          fileEntries: nextEntries ?? candidate.fileEntries,
        };
      });
    });
  }, []);

  const handleCreateFolder = useCallback((label: string) => {
    const clean = label.trim();
    if (!clean) {
      toast('Enter a workspace name.');
      return false;
    }
    const id = normaliseProjectId(clean);
    upsertProjectFolder({ id, label: clean, fileEntries: [] });
    setView('chats');
    toast(`Created workspace "${clean}".`);
    return true;
  }, [toast, upsertProjectFolder]);

  const handleCreateChatInFolder = useCallback((folder: { id: string; label: string }) => {
    const workspaceEntries = cloneFileEntries(
      projectFolders.find((workspace) => workspace.id === folder.id)?.fileEntries,
    );
    upsertProjectFolder({ id: folder.id, label: folder.label });
    createPanel({
      title: `${folder.label} Chat`,
      model: resolvedDefaultModel,
      preset: DEFAULT_PRESET_ID,
      projectId: folder.id,
      projectLabel: folder.label,
      messages: [],
      fileEntries: workspaceEntries,
      updatedAt: Date.now(),
    });
    setView('chats');
  }, [createPanel, projectFolders, resolvedDefaultModel, setView, upsertProjectFolder]);

  const closePanel = useCallback((id: string) => {
    setPanels(prev => {
      const next = prev.filter(p => p.id !== id);
      if (activePanelId === id) {
        setActivePanelId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [activePanelId]);

  const activatePanel = useCallback((id: string) => {
    setActivePanelId(id);
  }, []);

  const updatePanel = useCallback((id: string, patch: Partial<Panel>) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const savePanel = useCallback((panel: Panel) => {
    const fileEntries = entriesFromRegistry(panel.fileRegistry);
    if (panel.projectId && panel.projectLabel) {
      upsertProjectFolder({
        id: panel.projectId,
        label: panel.projectLabel,
        fileEntries,
      });
    }
    save({
      id: panel.id,
      title: panel.title,
      model: panel.model,
      preset: panel.preset,
      projectId: panel.projectId,
      projectLabel: panel.projectLabel,
      messages: panel.messages,
      updatedAt: Date.now(),
      fileEntries,
    });
  }, [save, upsertProjectFolder]);

  function handleOpenFromHistory(chat: ChatRecord) {
    const existing = panels.find((panel) => panel.id === chat.id);
    if (!existing) {
      const workspaceEntries = chat.projectId
        ? projectFolders.find((folder) => folder.id === chat.projectId)?.fileEntries
        : undefined;
      createPanel({
        ...chat,
        fileEntries: workspaceEntries?.length ? cloneFileEntries(workspaceEntries) : chat.fileEntries,
      });
    } else {
      setActivePanelId(existing.id);
    }
  }

  function handleImportChat(chat: ChatRecord) {
    if (chat.projectId && chat.projectLabel) {
      upsertProjectFolder({
        id: chat.projectId,
        label: chat.projectLabel,
        fileEntries: chat.fileEntries ?? [],
      });
    }
    save({
      id: chat.id,
      title: chat.title,
      model: chat.model,
      preset: chat.preset,
      projectId: chat.projectId,
      projectLabel: chat.projectLabel,
      messages: chat.messages,
      updatedAt: chat.updatedAt,
      fileEntries: chat.fileEntries ?? [],
    });
    handleOpenFromHistory(chat);
    toast(`Imported "${chat.title}"`);
  }

  async function handleImportLogs(files: File[]) {
    let imported = 0;
    for (const file of files) {
      const text = await file.text();
      const parsed = parseChatLog(text, file.name);
      if (!parsed) continue;
      handleImportChat(parsed);
      imported++;
    }
    if (!imported) {
      toast('No valid chat logs found in selected files.');
    }
  }

  async function handleImportDirectory(
    files: File[],
    targetFolder?: { id: string; label: string },
    labelOverride?: string,
  ) {
    let added = 0;
    const targetWorkspace = targetFolder
      ? projectFolders.find((folder) => folder.id === targetFolder.id)
      : undefined;
    let reg: FileRegistry = registryFromEntries(targetWorkspace?.fileEntries);
    let importedRoot = targetFolder?.label || targetWorkspace?.label || '';

    for (const file of files) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
      const parts = rel.split('/');
      if (!importedRoot && parts[0]) importedRoot = parts[0];
      const cleanPath = parts.length > 1 ? parts.slice(1).join('/') : rel;
      if (/\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|mp4|mp3|pdf|zip|tar|gz|lock)$/.test(cleanPath)) continue;
      if (/node_modules|\.git|\.next|dist\/|build\//.test(cleanPath)) continue;
      const fileText = await file.text();
      if (fileText.includes('\0')) continue;
      reg = updateRegistry(reg, [{ path: cleanPath, content: fileText, lang: langFromPath(cleanPath) }], 0);
      added++;
    }

    if (!added) {
      toast('No importable source files found.');
      return;
    }

    const projectLabel = targetFolder?.label || labelOverride?.trim() || importedRoot || 'Project';
    const projectId = targetFolder?.id || normaliseProjectId(projectLabel);
    const workspaceEntries = entriesFromRegistry(reg);

    upsertProjectFolder({
      id: projectId,
      label: projectLabel,
      fileEntries: workspaceEntries,
    });

    setPanels((prev) =>
      prev.map((panel) =>
        panel.projectId !== projectId
          ? panel
          : {
              ...panel,
              projectId,
              projectLabel,
              fileRegistry: registryFromEntries(workspaceEntries),
            },
      ),
    );

    setView('chats');
    if (targetFolder) {
      toast(`Updated workspace "${projectLabel}" with ${added} file${added !== 1 ? 's' : ''}.`);
    } else {
      toast(`Created workspace "${projectLabel}" with ${added} file${added !== 1 ? 's' : ''}.`);
    }
  }

  const requestDeleteChat = useCallback((id: string) => {
    const chat = chats.find((candidate) => candidate.id === id);
    requestConfirmation({
      title: 'Delete this chat?',
      message: `"${chat?.title || 'Untitled'}" will be permanently removed. This action cannot be undone.`,
      confirmLabel: 'Delete chat',
      onConfirm: async () => {
        await remove(id);
        closePanel(id);
        toast('Chat deleted.');
      },
    });
  }, [chats, closePanel, remove, requestConfirmation, toast]);

  const requestDeleteWorkspace = useCallback((workspace: { id: string; label: string }) => {
    const relatedChats = chats.filter((chat) => deriveWorkspaceFromChat(chat).id === workspace.id);
    const relatedIds = new Set(relatedChats.map((chat) => chat.id));
    const hasFolder = projectFolders.some((folder) => folder.id === workspace.id);
    const descriptor = relatedChats.length
      ? `This removes the workspace and ${relatedChats.length} chat${relatedChats.length !== 1 ? 's' : ''}.`
      : hasFolder
        ? 'This removes the empty workspace.'
        : 'This removes this workspace group.';

    requestConfirmation({
      title: 'Delete this workspace?',
      message: `${descriptor} This action cannot be undone.`,
      confirmLabel: 'Delete workspace',
      onConfirm: async () => {
        if (relatedChats.length) {
          await Promise.all(relatedChats.map((chat) => remove(chat.id)));
        }

        setProjectFolders((prev) => prev.filter((folder) => folder.id !== workspace.id));
        setPanels((prev) => {
          const next = prev.filter((panel) => !relatedIds.has(panel.id) && panel.projectId !== workspace.id);
          setActivePanelId((current) =>
            current && next.some((panel) => panel.id === current) ? current : next[0]?.id ?? null,
          );
          return next;
        });

        toast(`Deleted workspace "${workspace.label}".`);
      },
    });
  }, [chats, projectFolders, remove, requestConfirmation, toast]);

  const requestClearAll = useCallback(() => {
    requestConfirmation({
      title: 'Clear all conversation history?',
      message: 'All saved chats will be permanently removed. This action cannot be undone.',
      confirmLabel: 'Clear history',
      onConfirm: async () => {
        await clearAll();
        setPanels([]);
        setActivePanelId(null);
        toast('History cleared.');
      },
    });
  }, [clearAll, requestConfirmation, toast]);

  const statusLabel =
    status === 'connecting' ? 'connecting...' :
    status === 'online' ? `ollama / ${models.length} model${models.length !== 1 ? 's' : ''}` :
    'ollama offline';

  const chatHistoryBytes = ready ? measureJsonBytes(chats) : 0;
  const workspaceStorageBytes = estimateLocalStorageEntryBytes(
    FOLDERS_STORAGE_KEY,
    JSON.stringify(projectFolders),
  );
  const defaultModelStorageBytes = defaultModel
    ? estimateLocalStorageEntryBytes(DEFAULT_MODEL_STORAGE_KEY, defaultModel)
    : 0;
  const customPresetStorage = getCustomPresetStorageUsage();
  const appStorageBytes =
    chatHistoryBytes +
    workspaceStorageBytes +
    defaultModelStorageBytes +
    customPresetStorage.bytes;
  const storageBuckets = [
    {
      id: 'history',
      label: 'Chat history',
      bytes: chatHistoryBytes,
      note: ready
        ? `${chats.length} saved chat${chats.length !== 1 ? 's' : ''} in IndexedDB`
        : 'Reading saved chats from IndexedDB...',
      color: '#5ea7ff',
    },
    {
      id: 'workspaces',
      label: 'Workspaces',
      bytes: workspaceStorageBytes,
      note: `${projectFolders.length} workspace${projectFolders.length !== 1 ? 's' : ''} with workspace metadata and imported file maps`,
      color: '#6ed7b7',
    },
    {
      id: 'model',
      label: 'Default model',
      bytes: defaultModelStorageBytes,
      note: defaultModel ? `Saved preference: ${defaultModel}` : 'No explicit default model saved yet',
      color: '#f2b668',
    },
    {
      id: 'presets',
      label: 'Custom presets',
      bytes: customPresetStorage.bytes,
      note: customPresetStorage.count
        ? `${customPresetStorage.count} preset storage entr${customPresetStorage.count === 1 ? 'y' : 'ies'} detected`
        : 'No custom preset storage detected yet',
      color: '#c08cff',
    },
  ];
  const appQuotaRatio =
    browserStorage.supported &&
    browserStorage.quota != null &&
    browserStorage.quota > 0
      ? Math.min(100, (appStorageBytes / browserStorage.quota) * 100)
      : null;
  const storageMeterSegments = buildStorageVisualSegments(storageBuckets);
  const storageSegmentFloorPercent = storageMeterSegments.length
    ? Math.min(12, 100 / storageMeterSegments.length)
    : 0;
  const storageMeterMinimumWidthPx = storageSegmentFloorPercent > 0
    ? Math.ceil(14 / (storageSegmentFloorPercent / 100))
    : 0;
  const browserStorageBarWidth =
    appStorageBytes > 0 && appQuotaRatio != null
      ? `max(${appQuotaRatio}%, ${storageMeterMinimumWidthPx}px)`
      : '0%';
  const hoveredStorageBucket = storageMeterSegments.find((bucket) => bucket.id === hoveredStorageBucketId) ?? null;

  return (
    <div id="app">
      <input
        ref={importLogsSettingsRef}
        type="file"
        accept=".md,text/markdown"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void handleImportLogs(files);
        }}
      />
      <input
        ref={importWorkspaceLauncherRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const labelOverride = workspaceDraftName.trim();
          e.target.value = '';
          if (!files.length) return;
          closeWorkspaceLauncher();
          void handleImportDirectory(files, undefined, labelOverride || undefined);
        }}
      />

      <div id="app-shell">
        <Sidebar
          view={view}
          folders={projectFolders}
          chats={chats}
          openPanelIds={panels.map(p => p.id)}
          status={status}
          onChangeView={setView}
          onOpenWorkspaceLauncher={() => openWorkspaceLauncher('create')}
          onCreateChatInFolder={handleCreateChatInFolder}
          onOpenChat={handleOpenFromHistory}
          onDeleteChat={requestDeleteChat}
          onDeleteWorkspace={requestDeleteWorkspace}
        />

        <div id="main-content">
          {view === 'settings' ? (
            <div id="settings-view">
              <div className="settings-header">
                <span className="settings-eyebrow">Settings</span>
                <h2>Workspace defaults</h2>
                <p>Keep the sidebar lean, then manage models and imports from here.</p>
              </div>

              <div className="settings-sections">
                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>Models</h3>
                    <p>Choose the default model for every new chat created inside a workspace.</p>
                  </div>

                  <div className="settings-section-body">
                    <label className="settings-field">
                      <span>Default model</span>
                      <select
                        className="settings-select"
                        value={resolvedDefaultModel}
                        onChange={(e) => setDefaultModel(e.target.value)}
                        disabled={!models.length}
                      >
                        {models.length ? (
                          models.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))
                        ) : (
                          <option value="">No models available</option>
                        )}
                      </select>
                    </label>

                    <div className="settings-model-group">
                      <div className="settings-inline-row">
                        <span className="settings-inline-label">Available now</span>
                        <span className="settings-inline-note">Connection: {statusLabel}</span>
                      </div>

                      <div className="settings-model-list">
                        {models.length ? (
                          models.map((model) => (
                            <span
                              key={model}
                              className={`settings-model-chip${model === resolvedDefaultModel ? ' active' : ''}`}
                            >
                              {model}
                            </span>
                          ))
                        ) : (
                          <span className="settings-model-empty">No models available right now.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>Imports</h3>
                    <p>Chat log imports live here. Workspace file folders stay behind the workspace menus.</p>
                  </div>

                  <div className="settings-actions">
                    <button className="btn" onClick={() => importLogsSettingsRef.current?.click()}>
                      Import Logs
                    </button>
                  </div>
                </section>

                <section className="settings-section">
                  <div className="settings-section-head">
                    <h3>Storage</h3>
                    <p>Estimated local app data across IndexedDB and browser storage, shown as a single meter with category breakdown.</p>
                  </div>

                  <div className="settings-storage">
                    <div className="settings-storage-hero">
                      <div className="settings-storage-copy">
                        <span className="settings-storage-kicker">Larry AI storage</span>
                        <strong>{formatStorageSize(appStorageBytes)}</strong>
                        <span className="settings-inline-note">
                          Approximate local data stored by this app on this device.
                        </span>
                      </div>

                      <div className="settings-storage-browser-meta">
                        <span className="settings-storage-kicker">App vs browser limit</span>
                        <strong>
                          {browserStorage.supported && browserStorage.quota != null
                            ? `${formatStorageSize(appStorageBytes)} / ${formatStorageSize(browserStorage.quota)}`
                            : 'Unavailable'}
                        </strong>
                        <span className="settings-inline-note">
                          {appQuotaRatio != null
                            ? `Larry AI is using about ${appQuotaRatio.toFixed(appQuotaRatio < 10 ? 1 : 0)}% of this browser's storage limit.`
                            : 'Quota details are not exposed in this environment.'}
                        </span>
                      </div>
                    </div>

                    <div className="settings-storage-meter-block">
                      <div className="settings-storage-meter-head">
                        <span className="settings-storage-meter-label">Browser Storage</span>
                        <span className="settings-storage-meter-total">
                          {browserStorage.supported && browserStorage.quota != null
                            ? `${formatStorageSize(appStorageBytes)} of ${formatStorageSize(browserStorage.quota)}`
                            : formatStorageSize(appStorageBytes)}
                        </span>
                      </div>

                      <div
                        className="settings-storage-meter-stack"
                        onMouseEnter={cancelStoragePopupHide}
                        onMouseLeave={scheduleStoragePopupHide}
                      >
                        <div className="settings-storage-meter" role="list" aria-label="Larry AI browser storage breakdown">
                          {appStorageBytes > 0 ? (
                            <div className="settings-storage-meter-used" style={{ width: browserStorageBarWidth }}>
                              {storageMeterSegments.map((bucket) => (
                                <button
                                  type="button"
                                  key={bucket.id}
                                  className="settings-storage-meter-segment"
                                  onMouseEnter={() => {
                                    cancelStoragePopupHide();
                                    setHoveredStorageBucketId(bucket.id);
                                  }}
                                  onFocus={() => setHoveredStorageBucketId(bucket.id)}
                                  onBlur={scheduleStoragePopupHide}
                                  aria-label={`${bucket.label}, ${formatStorageSize(bucket.bytes)}, ${formatStoragePercent(bucket.contributionPercent)} of Larry AI storage`}
                                  style={{
                                    width: `${bucket.visualPercent}%`,
                                    background: bucket.color,
                                  }}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="settings-storage-meter-empty" />
                          )}
                        </div>

                        {hoveredStorageBucket && (
                          <div
                            className="settings-storage-meter-popup"
                            role="status"
                            aria-live="polite"
                            onMouseEnter={cancelStoragePopupHide}
                            onMouseLeave={scheduleStoragePopupHide}
                          >
                            <div className="settings-storage-meter-popup-head">
                              <span
                                className="settings-storage-dot settings-storage-dot-large"
                                style={{ background: hoveredStorageBucket.color }}
                                aria-hidden="true"
                              />
                              <strong>{hoveredStorageBucket.label}</strong>
                            </div>
                            <div className="settings-storage-meter-popup-line">
                              <span>Stored</span>
                              <strong>{formatStorageSize(hoveredStorageBucket.bytes)}</strong>
                            </div>
                            <div className="settings-storage-meter-popup-line">
                              <span>Contribution</span>
                              <strong>{formatStoragePercent(hoveredStorageBucket.contributionPercent)}</strong>
                            </div>
                            <p>{hoveredStorageBucket.note}</p>
                          </div>
                        )}
                      </div>

                      <div className="settings-storage-meter-caption">
                        {appQuotaRatio != null
                          ? `Larry AI is using about ${formatStoragePercent(appQuotaRatio)} of the browser storage limit. Hover a color segment to inspect what each category stores.`
                          : 'Quota details are not exposed in this environment.'}
                      </div>
                    </div>

                    <div className="settings-storage-breakdown">
                      {storageBuckets.map((bucket) => {
                        const share = appStorageBytes > 0 ? (bucket.bytes / appStorageBytes) * 100 : 0;
                        return (
                          <div key={bucket.id} className="settings-storage-row">
                            <div className="settings-storage-row-main">
                              <span
                                className="settings-storage-dot"
                                style={{ background: bucket.color }}
                                aria-hidden="true"
                              />
                              <div className="settings-storage-row-copy">
                                <div className="settings-storage-item-head">
                                  <span className="settings-storage-label">{bucket.label}</span>
                                  <span className="settings-storage-value">
                                    {bucket.bytes > 0 ? `${formatStorageSize(bucket.bytes)} - ${share.toFixed(share < 10 && share > 0 ? 1 : 0)}%` : '0 B'}
                                  </span>
                                </div>
                                <p>{bucket.note}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!customPresetStorage.count && (
                      <p className="settings-storage-footnote">
                        Custom presets are not being saved locally yet, so that category will stay at 0 B until preset persistence is added.
                      </p>
                    )}
                  </div>
                </section>

                <section className="settings-section danger">
                  <div className="settings-section-head">
                    <h3>History</h3>
                    <p>Clear saved conversation history across the app.</p>
                  </div>

                  <div className="settings-actions">
                    <button className="btn danger settings-danger-btn" onClick={requestClearAll}>
                      Clear All Conversation History
                    </button>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div id="workspace">
              {panels.length === 0 ? (
                <div id="no-panels">
                  <div style={{ fontSize: 56, opacity: 0.12, color: 'var(--accent)' }}>
                    <IconHexagon size={72} />
                  </div>
                  <h2>No workspace chats open</h2>
                  <p>Create a <strong>workspace</strong> from the sidebar, then start a chat inside it.<br />Up to 3 panels side-by-side.</p>
                </div>
              ) : (
                <div id="panels-area">
                  {panels.map(panel => (
                    <ChatPanel
                      key={panel.id}
                      panel={panel}
                      models={models}
                      onUpdate={updatePanel}
                      onClose={closePanel}
                      onSave={savePanel}
                      selected={activePanelId === panel.id}
                      onActivate={activatePanel}
                      onImportWorkspaceFiles={(files) => {
                        if (!panel.projectId || !panel.projectLabel) return;
                        void handleImportDirectory(files, {
                          id: panel.projectId,
                          label: panel.projectLabel,
                        });
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {workspaceLauncherOpen && (
        <div className="workspace-launcher-backdrop" onClick={closeWorkspaceLauncher}>
          <div className="workspace-launcher-modal" onClick={(e) => e.stopPropagation()}>
            <div className="workspace-launcher-head">
              <div
                className="workspace-launcher-toggle"
                data-mode={workspaceLauncherMode}
              >
                <span className="workspace-launcher-toggle-glider" />
                <button
                  className={`workspace-launcher-tab${workspaceLauncherMode === 'create' ? ' active' : ''}`}
                  onClick={() => setWorkspaceLauncherMode('create')}
                >
                  New workspace
                </button>
                <button
                  className={`workspace-launcher-tab${workspaceLauncherMode === 'import' ? ' active' : ''}`}
                  onClick={() => setWorkspaceLauncherMode('import')}
                >
                  Import folder
                </button>
              </div>

              <button
                className="workspace-launcher-close"
                onClick={closeWorkspaceLauncher}
                title="Close workspace launcher"
              >
                <IconX size={14} />
              </button>
            </div>

            <div
              className="workspace-launcher-stage"
              data-mode={workspaceLauncherMode}
            >
              <div className="workspace-launcher-track">
                <section className="workspace-launcher-panel">
                  <div className="workspace-launcher-hero">
                    <span className="workspace-launcher-icon">
                      <IconFolderPlus size={18} />
                    </span>
                    <div className="workspace-launcher-copy">
                      <h2>Create a workspace</h2>
                      <p>Name the workspace first. Chats and project files will live inside it.</p>
                    </div>
                  </div>

                  <label className="workspace-launcher-field">
                    <span>Workspace name</span>
                    <input
                      className="workspace-launcher-input"
                      value={workspaceDraftName}
                      onChange={(e) => setWorkspaceDraftName(e.target.value)}
                      placeholder="Enterprise Portal"
                    />
                  </label>

                  <div className="workspace-launcher-actions">
                    <button className="workspace-launcher-btn" onClick={closeWorkspaceLauncher}>
                      Cancel
                    </button>
                    <button
                      className="workspace-launcher-btn primary"
                      onClick={() => {
                        if (handleCreateFolder(workspaceDraftName)) {
                          closeWorkspaceLauncher();
                        }
                      }}
                    >
                      Create workspace
                    </button>
                  </div>
                </section>

                <section className="workspace-launcher-panel">
                  <div className="workspace-launcher-hero">
                    <span className="workspace-launcher-icon">
                      <IconUpload size={18} />
                    </span>
                    <div className="workspace-launcher-copy">
                      <h2>Import a project folder</h2>
                      <p>Select a file directory and Larry AI will build the workspace from it.</p>
                    </div>
                  </div>

                  <label className="workspace-launcher-field">
                    <span>Workspace name override</span>
                    <input
                      className="workspace-launcher-input"
                      value={workspaceDraftName}
                      onChange={(e) => setWorkspaceDraftName(e.target.value)}
                      placeholder="Optional - use folder name by default"
                    />
                  </label>

                  <p className="workspace-launcher-note">
                    Leave the name blank to use the selected directory name automatically.
                  </p>

                  <div className="workspace-launcher-actions">
                    <button className="workspace-launcher-btn" onClick={closeWorkspaceLauncher}>
                      Cancel
                    </button>
                    <button
                      className="workspace-launcher-btn primary"
                      onClick={() => importWorkspaceLauncherRef.current?.click()}
                    >
                      Select directory
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="confirm-backdrop" onClick={closeConfirmDialog}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-head">
              <span className="confirm-icon">
                <IconTrash2 size={18} />
              </span>
              <button
                className="confirm-close"
                onClick={closeConfirmDialog}
                title="Close confirmation"
                disabled={confirmBusy}
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="confirm-copy">
              <h2>{confirmDialog.title}</h2>
              <p>{confirmDialog.message}</p>
            </div>

            <div className="confirm-actions">
              <button className="confirm-btn" onClick={closeConfirmDialog} disabled={confirmBusy}>
                Cancel
              </button>
              <button
                className="confirm-btn danger"
                onClick={() => void handleConfirmAction()}
                disabled={confirmBusy}
              >
                {confirmBusy ? 'Deleting...' : confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
