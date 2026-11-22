import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const QC_RULES_VERSION = 'p4e-v1';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function getKitApiHash(repoRoot = process.cwd()): Promise<string> {
  try {
    const content = await readFile(path.join(repoRoot, 'docs', 'KIT-API.md'), 'utf-8');
    return sha256Hex(content);
  } catch {
    return 'missing-kit-api';
  }
}
