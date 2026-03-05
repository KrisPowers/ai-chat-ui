import React from 'react';
import { parseContent, renderTextBlock, extractFilePath, stripFileComment } from '../lib/markdown';
import type { CodeBlock as CodeBlockType } from '../lib/markdown';
import { CodeBlock } from './CodeBlock';
import { computeDiff } from '../lib/diffMetrics';
import { IconFileText, IconRefreshCw } from './Icon';
import type { Message } from '../types';
import type { FileRegistry } from '../lib/fileRegistry';

interface Props {
  message: Message;
  withDownload?: boolean;
  prevRegistry?: FileRegistry;
  currentRegistry?: FileRegistry;
}

function FileChangePill({
  block,
  prevContent,
}: {
  block: CodeBlockType;
  prevContent?: string;
}) {
  const resolvedPath = extractFilePath(block.code, block.suggestedFilename);
  const cleanCode = stripFileComment(block.code);
  const metrics = computeDiff(prevContent ?? '', cleanCode);
  const isNew = !prevContent;
  const name = resolvedPath.split('/').pop() ?? resolvedPath;
  const dir = resolvedPath.includes('/')
    ? resolvedPath.slice(0, resolvedPath.lastIndexOf('/'))
    : '';

  return (
    <div className="change-pill">
      <IconFileText size={12} className="change-pill-icon" />
      <div className="change-pill-info">
        {dir && <span className="change-pill-dir">{dir}/</span>}
        <span className="change-pill-name">{name}</span>
      </div>
      <div className="change-pill-metrics">
        {isNew ? (
          <span className="diff-added change-pill-new">new</span>
        ) : (
          <>
            {metrics.added > 0 && <span className="diff-added">+{metrics.added}</span>}
            {metrics.removed > 0 && <span className="diff-removed">−{metrics.removed}</span>}
          </>
        )}
      </div>
    </div>
  );
}

export function MessageBubble({ message, withDownload = false, prevRegistry, currentRegistry }: Props) {
  const isUser = message.role === 'user';
  const parsed = parseContent(message.content);

  const fileBlocks = parsed.parts
    .filter((p): p is { type: 'code'; block: CodeBlockType } => p.type === 'code')
    .filter(p => !p.block.isShell);

  return (
    <div className={`msg ${message.role}`}>
      <div className="msg-label">{isUser ? 'You' : 'Larry the Assistant'}</div>
      <div className="msg-bubble">
        {parsed.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <span key={i} dangerouslySetInnerHTML={{ __html: renderTextBlock(part.content) }} />
            );
          }
          if (withDownload && !isUser) {
            const resolvedPath = extractFilePath(part.block.code, part.block.suggestedFilename);
            const prevContent = prevRegistry?.get(resolvedPath)?.content;
            return <CodeBlock key={i} block={part.block} prevContent={prevContent} />;
          }
          return (
            <div key={i} className="code-block-wrapper">
              <div className="code-block-header">
                <span className="code-lang-badge">{part.block.lang || 'text'}</span>
              </div>
              <pre className="code-pre">
                <code className="block-code">{part.block.code}</code>
              </pre>
            </div>
          );
        })}
      </div>

      {!isUser && withDownload && fileBlocks.length > 0 && (
        <div className="change-summary">
          <div className="change-summary-label">
            <IconRefreshCw size={11} style={{ color: 'var(--accent)' }} />
            {fileBlocks.length} file{fileBlocks.length !== 1 ? 's' : ''} changed
          </div>
          <div className="change-pills">
            {fileBlocks.map(p => (
              <FileChangePill
                key={p.block.id}
                block={p.block}
                prevContent={prevRegistry?.get(
                  extractFilePath(p.block.code, p.block.suggestedFilename)
                )?.content}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
