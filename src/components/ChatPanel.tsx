import React, { useRef, useEffect, useState, useCallback, KeyboardEvent } from 'react';
import { MessageBubble } from './MessageBubble';
import { FileRegistryPanel } from './FileRegistryPanel';
import { streamChat } from '../lib/ollama';
import { updateRegistry, registryToSystemPrompt, createRegistry } from '../lib/fileRegistry';
import { extractCodeBlocksForRegistry } from '../lib/markdown';
import { PRESETS, getPreset, DEFAULT_PRESET_ID } from '../lib/presets';
import { readZipEntries } from '../lib/zip';
import {
  IconSend, IconStop, IconRotateCcw, IconX,
  IconPaperclip, IconFolder, IconHexagon,
  IconCode2, IconMessageSquare, IconSparkles,
} from './Icon';
import type { Panel, Message } from '../types';
import type { FileRegistry } from '../lib/fileRegistry';

interface Props {
  panel: Panel;
  models: string[];
  onUpdate: (id: string, patch: Partial<Panel>) => void;
  onClose: (id: string) => void;
  onSave: (panel: Panel) => void;
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

// Map preset id → icon component
const PRESET_ICONS: Record<string, React.ReactNode> = {
  code:     <IconCode2 size={12} />,
  chatbot:  <IconMessageSquare size={12} />,
  creative: <IconSparkles size={12} />,
};

export function ChatPanel({ panel, models, onUpdate, onClose, onSave }: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [panel.messages, panel.streamingContent]);

  useEffect(() => {
    if (!panel.streaming) inputRef.current?.focus();
  }, [panel.streaming]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || panel.streaming) return;
    setInputValue('');

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...panel.messages, userMsg];
    const snapshotRegistry: FileRegistry = new Map(panel.fileRegistry);

    onUpdate(panel.id, {
      messages: updatedMessages,
      streaming: true,
      streamingContent: '',
      prevRegistry: snapshotRegistry,
    });

    const abort = new AbortController();
    abortRef.current = abort;

    const preset = getPreset(panel.preset ?? DEFAULT_PRESET_ID);
    const systemPrompt = preset.systemPrompt + registryToSystemPrompt(panel.fileRegistry);

    let accumulated = '';

    try {
      const gen = streamChat(panel.model || models[0] || 'llama3', updatedMessages, systemPrompt, abort.signal);
      for await (const chunk of gen) {
        accumulated += chunk;
        onUpdate(panel.id, { streamingContent: accumulated });
      }

      const assistantMsg: Message = { role: 'assistant', content: accumulated };
      const finalMessages = [...updatedMessages, assistantMsg];
      const newBlocks = extractCodeBlocksForRegistry(accumulated);
      const updatedRegistry = updateRegistry(panel.fileRegistry, newBlocks, finalMessages.length - 1);

      const updated: Panel = {
        ...panel,
        messages: finalMessages,
        streaming: false,
        streamingContent: '',
        fileRegistry: updatedRegistry,
        prevRegistry: snapshotRegistry,
      };

      onUpdate(panel.id, {
        messages: finalMessages,
        streaming: false,
        streamingContent: '',
        fileRegistry: updatedRegistry,
        prevRegistry: snapshotRegistry,
      });
      onSave(updated);

    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        if (accumulated) {
          const assistantMsg: Message = { role: 'assistant', content: accumulated + '\n\n_[stopped]_' };
          const finalMessages = [...updatedMessages, assistantMsg];
          const newBlocks = extractCodeBlocksForRegistry(accumulated);
          const updatedRegistry = updateRegistry(panel.fileRegistry, newBlocks, finalMessages.length - 1);
          onUpdate(panel.id, { messages: finalMessages, streaming: false, streamingContent: '', fileRegistry: updatedRegistry, prevRegistry: snapshotRegistry });
          onSave({ ...panel, messages: finalMessages, fileRegistry: updatedRegistry, prevRegistry: snapshotRegistry });
        } else {
          onUpdate(panel.id, { streaming: false, streamingContent: '' });
        }
      } else {
        const errMsg: Message = {
          role: 'assistant',
          content: `Error: ${(err as Error).message}\n\nMake sure Ollama is running:\n\`\`\`bash\nOLLAMA_ORIGINS=* ollama serve\n\`\`\``,
        };
        onUpdate(panel.id, { messages: [...updatedMessages, errMsg], streaming: false, streamingContent: '' });
      }
    }
  }, [inputValue, panel, models, onUpdate, onSave]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

    let added = 0;
    let reg = new Map(panel.fileRegistry);

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      if (file.name.endsWith('.zip')) {
        const entries = readZipEntries(uint8);
        for (const entry of entries) {
          reg = updateRegistry(reg, [{ path: entry.path, content: entry.content, lang: langFromPath(entry.path) }], 0);
          added++;
        }
      } else {
        const content = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
        if (!content.includes('\0')) {
          reg = updateRegistry(reg, [{ path: file.name, content, lang: langFromPath(file.name) }], 0);
          added++;
        }
      }
    }

    const label = added === 1 ? '1 file' : `${added} files`;
    const sysMsg: Message = { role: 'assistant', content: `_Uploaded ${label} into the project registry._` };
    const finalMessages = [...panel.messages, sysMsg];
    onUpdate(panel.id, { messages: finalMessages, fileRegistry: reg });
    onSave({ ...panel, messages: finalMessages, fileRegistry: reg });
  }

  async function handleDirImport(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

    let reg = new Map(panel.fileRegistry);
    let added = 0;

    for (const file of files) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
      const parts = relativePath.split('/');
      const cleanPath = parts.length > 1 ? parts.slice(1).join('/') : relativePath;

      if (/\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|mp4|mp3|pdf|zip|tar|gz|lock)$/.test(cleanPath)) continue;
      if (/node_modules|\.git|\.next|dist\/|build\//.test(cleanPath)) continue;

      const text = await file.text();
      if (text.includes('\0')) continue;

      reg = updateRegistry(reg, [{ path: cleanPath, content: text, lang: langFromPath(cleanPath) }], 0);
      added++;
    }

    const label = added === 1 ? '1 file' : `${added} files`;
    const sysMsg: Message = { role: 'assistant', content: `_Imported ${label} from directory into the project registry._` };
    const finalMessages = [...panel.messages, sysMsg];
    onUpdate(panel.id, { messages: finalMessages, fileRegistry: reg });
    onSave({ ...panel, messages: finalMessages, fileRegistry: reg });
  }

  function handleStop() { abortRef.current?.abort(); }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function handleClear() {
    onUpdate(panel.id, { messages: [], fileRegistry: new Map(), prevRegistry: new Map() });
    onSave({ ...panel, messages: [], fileRegistry: new Map(), prevRegistry: new Map() });
  }

  function handlePresetChange(presetId: string) {
    const updated = { ...panel, preset: presetId };
    onUpdate(panel.id, { preset: presetId });
    onSave(updated);
  }

  const currentPreset = panel.preset ?? DEFAULT_PRESET_ID;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="panel-header">
        <input
          className="panel-title"
          value={panel.title}
          placeholder="Chat name..."
          onChange={e => onUpdate(panel.id, { title: e.target.value })}
          onBlur={() => onSave(panel)}
        />
        <select
          className="model-select"
          value={panel.model}
          onChange={e => onUpdate(panel.id, { model: e.target.value })}
        >
          {models.length === 0
            ? <option value="">No models</option>
            : models.map(m => <option key={m} value={m}>{m}</option>)
          }
        </select>

        {/* Preset selector */}
        <div className="preset-tabs">
          {PRESETS.map(p => (
            <button
              key={p.id}
              className={`preset-tab${currentPreset === p.id ? ' active' : ''}`}
              onClick={() => handlePresetChange(p.id)}
              title={p.label}
            >
              {PRESET_ICONS[p.id]} {p.label}
            </button>
          ))}
        </div>

        <button className="panel-btn" onClick={handleClear} title="Clear messages">
          <IconRotateCcw size={13} />
        </button>
        <button className="panel-btn close" onClick={() => onClose(panel.id)} title="Close panel">
          <IconX size={13} />
        </button>
      </div>

      {/* Messages */}
      <div className="messages">
        {panel.messages.length === 0 && !panel.streaming ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconHexagon size={52} />
            </div>
            <h3>Ready</h3>
            <p>Ask me to write code, generate docs, or debug anything.</p>
          </div>
        ) : (
          <>
            {panel.messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                withDownload={true}
                prevRegistry={panel.prevRegistry}
                currentRegistry={panel.fileRegistry}
              />
            ))}
            {panel.streaming && (
              panel.streamingContent ? (
                <MessageBubble
                  message={{ role: 'assistant', content: panel.streamingContent }}
                  withDownload={false}
                  prevRegistry={panel.prevRegistry}
                  currentRegistry={panel.fileRegistry}
                />
              ) : (
                <div className="thinking">
                  <div className="thinking-dots"><span /><span /><span /></div>
                  <span>thinking...</span>
                </div>
              )
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <FileRegistryPanel registry={panel.fileRegistry} chatTitle={panel.title} />

      {/* Input */}
      <div className="panel-input">
        <div className="input-row">
          <input ref={fileInputRef} type="file" multiple accept="*/*" style={{ display: 'none' }} onChange={handleFileUpload} />
          <input ref={dirInputRef} type="file"
            // @ts-ignore
            webkitdirectory="" multiple style={{ display: 'none' }} onChange={handleDirImport} />

          <div className="input-actions">
            <button className="input-action-btn" onClick={() => fileInputRef.current?.click()} title="Upload files or zip" disabled={panel.streaming}>
              <IconPaperclip size={14} />
            </button>
            <button className="input-action-btn" onClick={() => dirInputRef.current?.click()} title="Import project directory" disabled={panel.streaming}>
              <IconFolder size={14} />
            </button>
          </div>

          <textarea
            ref={inputRef}
            className="msg-input"
            rows={1}
            placeholder="Ask anything… (Shift+Enter for newline)"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={panel.streaming}
          />
          {panel.streaming ? (
            <button className="send-btn stop" onClick={handleStop} title="Stop generation">
              <IconStop size={14} />
            </button>
          ) : (
            <button className="send-btn" onClick={handleSend} disabled={!inputValue.trim()}>
              <IconSend size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
