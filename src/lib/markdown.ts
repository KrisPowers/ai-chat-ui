export const EXT_MAP: Record<string, string> = {
  js: 'js', javascript: 'js',
  ts: 'ts', typescript: 'ts',
  jsx: 'jsx', tsx: 'tsx',
  md: 'md', markdown: 'md',
  html: 'html', css: 'css', scss: 'scss',
  py: 'py', python: 'py',
  json: 'json',
  sh: 'sh', bash: 'sh', shell: 'sh',
  sql: 'sql', yaml: 'yml', yml: 'yml', xml: 'xml',
  c: 'c', cpp: 'cpp', java: 'java', rs: 'rs', go: 'go',
};

const DEFAULT_NAMES: Record<string, string> = {
  js: 'index', javascript: 'index',
  ts: 'index', typescript: 'index',
  jsx: 'App', tsx: 'App',
  html: 'index', css: 'styles', scss: 'styles',
  py: 'main', python: 'main',
  json: 'data',
  sh: 'script', bash: 'script', shell: 'script',
  sql: 'query',
  md: 'README', markdown: 'README',
  yaml: 'config', yml: 'config',
  xml: 'config',
  go: 'main', rs: 'main', java: 'Main', c: 'main', cpp: 'main',
};

const FENCE_CONTAINING_LANGS = new Set(['md', 'markdown', 'text', 'txt', '']);

export const SHELL_LANGS = new Set([
  'bash', 'sh', 'shell', 'zsh', 'fish', 'bat', 'cmd', 'powershell', 'ps1',
]);

export interface CodeBlock {
  id: string;
  lang: string;
  ext: string;
  code: string;
  suggestedFilename: string;
  isShell: boolean;
}

export interface ParsedContent {
  parts: Array<{ type: 'text'; content: string } | { type: 'code'; block: CodeBlock }>;
}

let blockCounter = 0;

function detectFilename(contextText: string, ext: string): string | null {
  const tail = contextText.slice(-300);
  const filenamePattern = /(?:^|[\s(`'"*([])([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]{1,6})(?:[)`'"*\]\s:,]|$)/gm;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = filenamePattern.exec(tail)) !== null) matches.push(m[1]);
  if (!matches.length) return null;
  const extNorm = ext.toLowerCase();
  const sameExt = matches.filter(f => f.toLowerCase().endsWith(`.${extNorm}`));
  if (sameExt.length) return sameExt[sameExt.length - 1];
  const withDot = matches.filter(f => f.includes('.') && !f.startsWith('.'));
  if (withDot.length) return withDot[withDot.length - 1];
  return null;
}

/**
 * Preprocess: convert inline single-line triple-backtick spans to proper fenced blocks.
 *
 * Handles both forms the AI produces:
 *   ```bash npm install```          — lang + space + content (original case)
 *   ``` DISCORD_TOKEN=... ```       — no lang, just spaces around content
 *   ```bash npm install discord```  — multi-word commands
 *
 * The key fix vs the old regex: we now also match fences with NO lang tag but
 * content surrounded by spaces/tabs (the ``` content ``` form), and we do NOT
 * require at least one space — we just require the content has no newlines and
 * isn't itself a bare fence opener (i.e. it must have non-backtick chars).
 */
function preprocess(raw: string): string {
  // Form 1: ```lang content```  (lang word immediately after fence, space before content)
  raw = raw.replace(/```(\w+)[ \t]+([^`\n]+?)[ \t]*```/g, (_m, lang, code) => {
    return `\n\`\`\`${lang.trim()}\n${code.trim()}\n\`\`\`\n`;
  });
  // Form 2: ``` content ```  (no lang, content wrapped in spaces)
  // Must have at least one space on each side to avoid matching real fence openers
  raw = raw.replace(/```[ \t]+([^`\n]+?)[ \t]*```/g, (_m, code) => {
    return `\n\`\`\`bash\n${code.trim()}\n\`\`\`\n`;
  });
  return raw;
}

export function parseContent(raw: string): ParsedContent {
  const parts: ParsedContent['parts'] = [];
  const lines = preprocess(raw).split('\n');
  let i = 0;
  let textBuffer = '';

  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^(`{3,})(\w*)\s*$/);

    if (fenceMatch) {
      const outerFence = fenceMatch[1];
      const outerFenceLen = outerFence.length;
      const lang = (fenceMatch[2] || '').toLowerCase();
      const isFenceContaining = FENCE_CONTAINING_LANGS.has(lang);
      const codeLines: string[] = [];
      i++;

      while (i < lines.length) {
        const inner = lines[i];
        const closeMatch = inner.match(/^(`{3,})\s*$/);
        if (isFenceContaining) {
          if (closeMatch && closeMatch[1] === outerFence) { i++; break; }
        } else {
          if (closeMatch && closeMatch[1].length >= outerFenceLen) { i++; break; }
        }
        codeLines.push(inner);
        i++;
      }

      if (textBuffer) {
        parts.push({ type: 'text', content: textBuffer });
        textBuffer = '';
      }

      const ext = EXT_MAP[lang] ?? (lang || 'txt');
      const contextSoFar = parts
        .filter(p => p.type === 'text')
        .map(p => (p as { type: 'text'; content: string }).content)
        .join('');
      const detected = detectFilename(contextSoFar, ext);
      const defaultStem = DEFAULT_NAMES[lang] ?? 'file';
      const suggestedFilename = detected ?? `${defaultStem}.${ext}`;

      parts.push({
        type: 'code',
        block: {
          id: `cb_${++blockCounter}`,
          lang, ext,
          code: codeLines.join('\n').replace(/\n$/, ''),
          suggestedFilename,
          isShell: SHELL_LANGS.has(lang),
        },
      });
    } else {
      textBuffer += (i === 0 || textBuffer === '' ? '' : '\n') + line;
      i++;
    }
  }

  if (textBuffer) parts.push({ type: 'text', content: textBuffer });
  return { parts };
}

export function renderInlineMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Renders a markdown table string into an HTML <table>.
 * Input: the raw table lines (including separator row).
 */
function renderTable(lines: string[]): string {
  // Filter out the separator row (---|--- pattern)
  const rows = lines.filter(l => !/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?\s*$/.test(l));
  if (rows.length === 0) return '';

  const parseRow = (line: string): string[] =>
    line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  const [headerRow, ...bodyRows] = rows;
  const headers = parseRow(headerRow);

  const thead = '<thead><tr>' +
    headers.map(h => `<th>${renderInlineMarkdown(h)}</th>`).join('') +
    '</tr></thead>';

  const tbody = bodyRows.length
    ? '<tbody>' +
      bodyRows.map(row => {
        const cells = parseRow(row);
        return '<tr>' + cells.map(c => `<td>${renderInlineMarkdown(c)}</td>`).join('') + '</tr>';
      }).join('') +
      '</tbody>'
    : '';

  return `<table>${thead}${tbody}</table>`;
}

export function renderTextBlock(text: string): string {
  // ── Pre-clean AI artifacts ────────────────────────────────────────────────
  text = text.replace(/^(?:\/\/\s*|#\s*|<!--\s*)?FILE:\s*.+?(?:\s*-->)?\s*$/gm, '');
  text = text.replace(
    /`(bash|sh|shell|node|python|py|js|ts|npm|npx|yarn|pnpm|cmd|powershell)\s+([^`\n]+)`/g,
    '`$2`'
  );
  text = text.replace(/^`{1,2}\s*$/gm, '');

  // ── Extract tables BEFORE any escaping ───────────────────────────────────
  // We pull each table out of the text entirely, render it to HTML, store in
  // a map keyed by a safe placeholder token, then run all markdown processing
  // on the remaining text. The real HTML is spliced back in at the very end,
  // after all escaping is done, so angle brackets in table cells are safe.
  const tableMap = new Map<string, string>();
  let tableCounter = 0;

  const inputLines = text.split('\n');
  const processedLines: string[] = [];
  let i = 0;

  while (i < inputLines.length) {
    const line = inputLines[i];
    const isTableRow = /\|/.test(line);
    const nextIsSep = i + 1 < inputLines.length &&
      /^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?\s*$/.test(inputLines[i + 1]);

    if (isTableRow && nextIsSep) {
      const tableLines: string[] = [];
      while (i < inputLines.length && /\|/.test(inputLines[i])) {
        tableLines.push(inputLines[i]);
        i++;
      }
      const token = `TABLETOK${tableCounter++}END`;
      tableMap.set(token, renderTable(tableLines));
      processedLines.push(token);
    } else {
      processedLines.push(line);
      i++;
    }
  }

  const cleaned = processedLines.join('\n');

  // ── Standard markdown → HTML (only runs on non-table text) ───────────────
  let html = cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr />')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^[\*\-] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<(?:h[123]|ul|ol|div|blockquote|hr|pre))/g, '$1');
  html = html.replace(/(<\/(?:h[123]|ul|ol|div|blockquote|hr|pre)>)<\/p>/g, '$1');

  // ── Splice table HTML back in (token placeholders were never escaped) ─────
  for (const [token, tableHtml] of tableMap) {
    // The token may be wrapped in <p>...</p> from the paragraph pass — unwrap it
    html = html.replace(new RegExp(`<p>${token}</p>`, 'g'), tableHtml);
    html = html.replace(new RegExp(token, 'g'), tableHtml);
  }

  return html;
}

export function extractFilePath(code: string, suggestedFilename: string): string {
  const firstLine = code.split('\n')[0].trim();
  const patterns = [
    /^\/\/\s*FILE:\s*(.+)$/,
    /^#\s*FILE:\s*(.+)$/,
    /^<!--\s*FILE:\s*(.+?)\s*-->$/,
  ];
  for (const pat of patterns) {
    const m = firstLine.match(pat);
    if (m) {
      const p = m[1].trim();
      if (p && p.includes('.')) return p;
    }
  }
  return suggestedFilename;
}

export function stripFileComment(code: string): string {
  const lines = code.split('\n');
  const first = lines[0].trim();
  if (
    /^\/\/\s*FILE:/.test(first) ||
    /^#\s*FILE:/.test(first) ||
    /^<!--\s*FILE:/.test(first)
  ) {
    return lines.slice(1).join('\n').replace(/^\n/, '');
  }
  return code;
}

export function extractCodeBlocksForRegistry(
  raw: string,
): Array<{ path: string; content: string; lang: string }> {
  const { parts } = parseContent(raw);
  return parts
    .filter((p): p is { type: 'code'; block: CodeBlock } => p.type === 'code')
    .filter(p => !p.block.isShell)
    .map(p => ({
      path: extractFilePath(p.block.code, p.block.suggestedFilename),
      content: stripFileComment(p.block.code),
      lang: p.block.lang,
    }))
    .filter(b => b.content.trim().length > 0);
}
