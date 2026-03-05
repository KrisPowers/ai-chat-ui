import React, { useState, useRef } from 'react';
import type { CodeBlock as CodeBlockType } from '../lib/markdown';
import { extractFilePath, stripFileComment } from '../lib/markdown';
import { computeDiff, formatMetrics } from '../lib/diffMetrics';
import { useToast } from '../hooks/useToast';
import {
  IconChevronDown, IconChevronRight,
  IconDownload, IconCopy, IconCheck, IconGripHorizontal,
} from './Icon';

interface Props {
  block: CodeBlockType;
  prevContent?: string;
}

const LANG_COLORS: Record<string, string> = {
  js: 'lang-js', javascript: 'lang-js',
  ts: 'lang-js', typescript: 'lang-js',
  jsx: 'lang-js', tsx: 'lang-js',
  md: 'lang-md', markdown: 'lang-md',
  html: 'lang-html', css: 'lang-html', scss: 'lang-html',
  py: 'lang-py', python: 'lang-py',
  json: 'lang-json',
  sh: 'lang-sh', bash: 'lang-sh', shell: 'lang-sh',
};

const DEFAULT_HEIGHT = 260;
const MIN_HEIGHT = 60;

export function CodeBlock({ block, prevContent }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  const resolvedPath = extractFilePath(block.code, block.suggestedFilename);
  const cleanCode = stripFileComment(block.code);
  const [filename, setFilename] = useState(resolvedPath);
  const dragStartY = useRef<number | null>(null);
  const dragStartH = useRef<number>(DEFAULT_HEIGHT);
  const langClass = LANG_COLORS[block.lang] ?? '';

  const metrics = !block.isShell ? computeDiff(prevContent ?? '', cleanCode) : null;
  const metricsStr = metrics ? formatMetrics(metrics) : '';
  const isNew = metrics && !prevContent;

  function handleCopy() {
    navigator.clipboard.writeText(cleanCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownload() {
    let name = filename.trim() || resolvedPath;
    if (!name.includes('.')) name += `.${block.ext}`;
    const blob = new Blob([cleanCode], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name.split('/').pop() ?? name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Downloaded ${name}`);
  }

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartH.current = height;
    function onMove(ev: MouseEvent) {
      if (dragStartY.current === null) return;
      setHeight(Math.max(MIN_HEIGHT, dragStartH.current + ev.clientY - dragStartY.current));
    }
    function onUp() {
      dragStartY.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const lineCount = cleanCode.split('\n').length;

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className={`code-lang-badge ${langClass}`}>{block.lang || 'text'}</span>

        <button
          className="code-action-btn collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed
            ? <IconChevronRight size={12} />
            : <IconChevronDown size={12} />
          }
          {collapsed ? 'Show' : 'Hide'}
          <span className="line-count">{lineCount} lines</span>
        </button>

        {metrics && metricsStr && (
          <span className={`diff-metrics${isNew ? ' diff-new' : ''}`}>
            {isNew ? (
              <span className="diff-added">new file</span>
            ) : (
              <>
                {metrics.added > 0 && <span className="diff-added">+{metrics.added}</span>}
                {metrics.added > 0 && metrics.removed > 0 && <span className="diff-sep"> / </span>}
                {metrics.removed > 0 && <span className="diff-removed">−{metrics.removed}</span>}
              </>
            )}
          </span>
        )}

        <div className="code-block-actions">
          {!block.isShell && (
            <>
              <input
                className="code-filename-input"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                spellCheck={false}
                title="File path for download"
              />
              <button className="code-action-btn download" onClick={handleDownload} title="Download">
                <IconDownload size={12} /> Download
              </button>
            </>
          )}
          <button className={`code-action-btn${copied ? ' copied' : ''}`} onClick={handleCopy} title="Copy">
            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <pre className="code-pre" style={{ height, minHeight: MIN_HEIGHT, overflow: 'auto' }}>
            <code className="block-code">{cleanCode}</code>
          </pre>
          <div className="code-resize-handle" onMouseDown={onResizeMouseDown} title="Drag to resize">
            <IconGripHorizontal size={14} />
          </div>
        </>
      )}
    </div>
  );
}
