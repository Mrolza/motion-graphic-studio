import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walkTs(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTs(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('Module Boundary Guard', () => {
  it('ensures src/core/ never imports from src/cli/, src/app/, src/components/, or remotion/', () => {
    const coreFiles = walkTs(path.join(process.cwd(), 'src', 'core'));
    expect(coreFiles.length).toBeGreaterThan(0);

    const forbidden = /from\s+['"](?:\.\.\/)*(?:src\/)?(?:cli|app|components|remotion)\b|from\s+['"]@\/(?:app|components|cli)\b/;
    const violations: string[] = [];

    for (const file of coreFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (forbidden.test(content)) {
        violations.push(path.relative(process.cwd(), file));
      }
    }

    expect(violations).toEqual([]);
  });
});
