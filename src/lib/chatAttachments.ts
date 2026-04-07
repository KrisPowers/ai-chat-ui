import type { FileEntry } from './fileRegistry';
import { readZipEntries } from './zip';

export interface ImportableAttachment {
  path: string;
  content: string;
  lang: string;
}

const SKIP_EXTENSION_RE = /\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|mp4|mp3|pdf|tar|gz|lock)$/i;
const SKIP_PATH_RE = /(^|\/)(node_modules|\.git|\.next|dist|build)(\/|$)/i;
const QUANTIZATION_TOKEN_RE = /^(q\d|iq\d|f16|fp16|fp32|gguf|latest)$/i;

function langFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    py: 'py',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    md: 'md',
    sh: 'sh',
    bash: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    go: 'go',
    rs: 'rs',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'h',
    hpp: 'hpp',
  };

  return map[ext] ?? ext ?? 'text';
}

function normalizeAttachmentPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').trim();
}

function isImportablePath(path: string): boolean {
  const normalized = normalizeAttachmentPath(path);
  if (!normalized) return false;
  if (SKIP_EXTENSION_RE.test(normalized)) return false;
  if (SKIP_PATH_RE.test(normalized)) return false;
  return true;
}

function dedupeAttachments(entries: ImportableAttachment[]): ImportableAttachment[] {
  const next = new Map<string, ImportableAttachment>();
  for (const entry of entries) {
    next.set(normalizeAttachmentPath(entry.path), {
      path: normalizeAttachmentPath(entry.path),
      content: entry.content,
      lang: entry.lang,
    });
  }

  return [...next.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export async function readImportableAttachments(files: File[]): Promise<ImportableAttachment[]> {
  const imported: ImportableAttachment[] = [];

  for (const file of files) {
    const normalizedName = normalizeAttachmentPath(file.name);
    if (!normalizedName) continue;

    if (/\.zip$/i.test(normalizedName)) {
      const archiveEntries = readZipEntries(new Uint8Array(await file.arrayBuffer()));
      for (const entry of archiveEntries) {
        if (!isImportablePath(entry.path)) continue;
        if (entry.content.includes('\0')) continue;
        imported.push({
          path: normalizeAttachmentPath(entry.path),
          content: entry.content,
          lang: langFromPath(entry.path),
        });
      }
      continue;
    }

    if (!isImportablePath(normalizedName)) continue;
    const content = await file.text();
    if (content.includes('\0')) continue;
    imported.push({
      path: normalizedName,
      content,
      lang: langFromPath(normalizedName),
    });
  }

  return dedupeAttachments(imported);
}

export function mergeImportableAttachments(
  ...groups: Array<ImportableAttachment[] | undefined>
): ImportableAttachment[] {
  return dedupeAttachments(groups.flatMap((group) => group ?? []));
}

export function attachmentsToStoredEntries(entries: ImportableAttachment[]): FileEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    updatedAt: index,
  }));
}

export function mergeStoredFileEntries(...groups: Array<FileEntry[] | undefined>): FileEntry[] {
  const next = new Map<string, FileEntry>();

  for (const group of groups) {
    for (const entry of group ?? []) {
      const normalizedPath = normalizeAttachmentPath(entry.path);
      if (!normalizedPath) continue;
      next.set(normalizedPath, {
        ...entry,
        path: normalizedPath,
      });
    }
  }

  let index = 0;
  return [...next.values()]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => ({
      ...entry,
      updatedAt: entry.updatedAt ?? index++,
    }));
}

export function isLikelyQuantizationToken(token: string): boolean {
  return QUANTIZATION_TOKEN_RE.test(token);
}
