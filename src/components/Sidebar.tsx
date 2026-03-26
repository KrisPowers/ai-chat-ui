import { useMemo, useState } from 'react';
import type { ChatRecord, ProjectFolder } from '../types';
import {
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconMessageSquare,
  IconSettings,
  IconTrash2,
} from './Icon';

interface Props {
  view: 'chats' | 'settings';
  folders: ProjectFolder[];
  chats: ChatRecord[];
  openPanelIds: string[];
  status: 'connecting' | 'online' | 'error';
  onChangeView: (view: 'chats' | 'settings') => void;
  onOpenWorkspaceLauncher: () => void;
  onCreateChatInFolder: (folder: { id: string; label: string }) => void;
  onOpenChat: (chat: ChatRecord) => void;
  onDeleteChat: (id: string) => void;
  onDeleteWorkspace: (workspace: { id: string; label: string }) => void;
}

interface ChatGroup {
  id: string;
  label: string;
  chats: ChatRecord[];
  updatedAt: number;
}

function normaliseProjectId(label: string): string {
  return `project:${label.toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}`;
}

function deriveProjectFromEntries(chat: ChatRecord): { id: string; label: string } {
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

function formatSidebarAge(updatedAt: number): string {
  const deltaMinutes = Math.max(1, Math.floor((Date.now() - updatedAt) / 60000));
  if (deltaMinutes < 60) return `${deltaMinutes}m`;

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h`;

  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 7) return `${deltaDays}d`;

  return new Date(updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function Sidebar({
  view,
  folders,
  chats,
  openPanelIds,
  status,
  onChangeView,
  onOpenWorkspaceLauncher,
  onCreateChatInFolder,
  onOpenChat,
  onDeleteChat,
  onDeleteWorkspace,
}: Props) {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const groups = useMemo<ChatGroup[]>(() => {
    const map = new Map<string, ChatGroup>();
    for (const chat of chats) {
      const project = deriveProjectFromEntries(chat);
      const existing = map.get(project.id);
      if (!existing) {
        map.set(project.id, {
          id: project.id,
          label: project.label,
          chats: [chat],
          updatedAt: chat.updatedAt,
        });
      } else {
        existing.chats.push(chat);
        existing.updatedAt = Math.max(existing.updatedAt, chat.updatedAt);
      }
    }

    for (const folder of folders) {
      if (!map.has(folder.id)) {
        map.set(folder.id, {
          id: folder.id,
          label: folder.label,
          chats: [],
          updatedAt: folder.createdAt,
        });
      }
    }

    return [...map.values()].sort((a, b) => {
      if (a.id === 'project:general') return 1;
      if (b.id === 'project:general') return -1;
      return b.updatedAt - a.updatedAt;
    });
  }, [chats, folders]);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <button
          className="sidebar-brand-link"
          onClick={() => {
            setActiveWorkspaceId(null);
            onChangeView('chats');
          }}
          title="Workspaces"
        >
          <span className={`sidebar-status-indicator ${status}`} />
          <span className="sidebar-brand-name">Larry AI</span>
        </button>
      </div>

      <button
        className="sidebar-nav-link primary"
        onClick={() => {
          onChangeView('chats');
          setActiveWorkspaceId(null);
          onOpenWorkspaceLauncher();
        }}
        title="Create workspace"
      >
        <span className="sidebar-nav-icon">
          <IconFolderPlus size={14} />
        </span>
        <span>New workspace</span>
      </button>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span className="sidebar-section-title">Workspaces</span>
        </div>

        <div className="sidebar-workspaces">
          {groups.length === 0 ? (
            <div className="sidebar-empty">
              Create a workspace first. Chats only appear after a workspace exists.
            </div>
          ) : (
            groups.map((group) => {
              const isActive = activeWorkspaceId === group.id;
              return (
                <div key={group.id} className="sidebar-workspace">
                  <div className={`sidebar-workspace-head${isActive ? ' active' : ''}`}>
                    <button
                      className={`sidebar-workspace-row${isActive ? ' active' : ''}`}
                      aria-expanded={isActive}
                      onClick={() => {
                        onChangeView('chats');
                        setActiveWorkspaceId((current) => (current === group.id ? null : group.id));
                      }}
                      title={group.label}
                    >
                      <span className="sidebar-workspace-row-icon">
                        {isActive ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}
                      </span>
                      <span className="sidebar-workspace-row-label">{group.label}</span>
                    </button>

                    {isActive && (
                      <div className="sidebar-workspace-inline-tools">
                        <button
                          className="sidebar-icon-tool primary"
                          onClick={() => onCreateChatInFolder({ id: group.id, label: group.label })}
                          title="New chat"
                        >
                          <IconMessageSquare size={13} />
                        </button>
                        <button
                          className="sidebar-icon-tool danger"
                          onClick={() => onDeleteWorkspace({ id: group.id, label: group.label })}
                          title="Delete workspace"
                        >
                          <IconTrash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {isActive && (
                    <div className="sidebar-workspace-body">
                      {group.chats.length > 0 ? (
                        <div className="sidebar-thread-list">
                          {group.chats.map((chat) => {
                            const isOpen = openPanelIds.includes(chat.id);
                            return (
                              <div
                                key={chat.id}
                                className={`sidebar-thread-row${isOpen ? ' open' : ''}`}
                              >
                                <button
                                  className="sidebar-thread-open"
                                  onClick={() => onOpenChat(chat)}
                                  title={chat.title || 'Untitled'}
                                >
                                  <span className="sidebar-thread-title">
                                    {chat.title || 'Untitled'}
                                  </span>
                                  <span className="sidebar-thread-time">
                                    {formatSidebarAge(chat.updatedAt)}
                                  </span>
                                </button>
                                <button
                                  className="sidebar-thread-delete"
                                  title="Delete chat"
                                  onClick={() => onDeleteChat(chat.id)}
                                >
                                  <IconTrash2 size={11} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="sidebar-workspace-empty">
                          No chats yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <button
          className={`sidebar-nav-link${view === 'settings' ? ' active' : ''}`}
          onClick={() => {
            setActiveWorkspaceId(null);
            onChangeView(view === 'settings' ? 'chats' : 'settings');
          }}
          title="Settings"
        >
          <span className="sidebar-nav-icon">
            <IconSettings size={14} />
          </span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
