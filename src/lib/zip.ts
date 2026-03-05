import { zipSync, strToU8, unzipSync } from 'fflate';
import type { FileRegistry } from './fileRegistry';

export function downloadRegistryAsZip(registry: FileRegistry, zipName = 'project.zip'): void {
  if (registry.size === 0) return;

  const files: Record<string, Uint8Array> = {};
  for (const entry of registry.values()) {
    const path = entry.path.replace(/\\/g, '/').replace(/^\//, '');
    files[path] = strToU8(entry.content);
  }

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(url);
}

/** 
 * Reads a .zip Uint8Array and returns flat path→text entries.
 * Used when the user uploads a zip as project context.
 */
export function readZipEntries(data: Uint8Array): Array<{ path: string; content: string }> {
  const unzipped = unzipSync(data);
  const results: Array<{ path: string; content: string }> = [];
  const decoder = new TextDecoder('utf-8', { fatal: false });

  for (const [path, bytes] of Object.entries(unzipped)) {
    // Skip directories and binary files (detect by null bytes heuristic)
    if (path.endsWith('/')) continue;
    const content = decoder.decode(bytes);
    if (content.includes('\0')) continue; // binary — skip
    results.push({ path, content });
  }

  return results;
}
