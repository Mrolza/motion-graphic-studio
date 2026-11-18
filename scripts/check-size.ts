import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const IGNORE_DIRS = new Set(['node_modules', '.git', 'archive', 'out', 'projects', '.mgs', '.next']);

interface SizeViolation {
  file: string;
  lines: number;
  limit: number;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const files = [
    ...walk(path.join(REPO_ROOT, 'src')),
    ...walk(path.join(REPO_ROOT, 'remotion', 'src')),
    ...walk(path.join(REPO_ROOT, 'scripts')),
  ];

  const violations: SizeViolation[] = [];
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
    if (rel.includes('/generated') || rel.includes('/fixtures/')) continue;

    const lineCount = fs.readFileSync(file, 'utf-8').split(/\r?\n/).length;
    const limit = rel.startsWith('remotion/src/scenes/') ? 300 : 400;
    if (lineCount > limit) {
      violations.push({ file: rel, lines: lineCount, limit });
    }
  }

  if (violations.length > 0) {
    console.error('File size violations detected:');
    for (const v of violations) {
      console.error(`  ${v.file}: ${v.lines} lines (limit ${v.limit})`);
    }
    process.exit(1);
  }

  console.log(`check:size OK (${files.length} source files checked, all within limits).`);
}

main();
