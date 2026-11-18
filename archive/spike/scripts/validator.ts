import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { SPIKE_ROOT } from './remotion-helper';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const ALLOWED_IMPORTS = new Set(['react', 'remotion', '@kit', '../kit', '../../kit']);

const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'fetch', regex: /\bfetch\s*\(/ },
  { name: 'eval', regex: /\beval\s*\(/ },
  { name: 'Function constructor', regex: /\bnew\s+Function\b|\bFunction\s*\(/ },
  { name: 'dynamic import()', regex: /\bimport\s*\(/ },
  { name: 'window', regex: /\bwindow\b/ },
  { name: 'document', regex: /\bdocument\b/ },
  { name: 'localStorage', regex: /\blocalStorage\b/ },
  { name: 'sessionStorage', regex: /\bsessionStorage\b/ },
  { name: 'Math.random', regex: /\bMath\.random\b/ },
  { name: 'Date.now', regex: /\bDate\.now\b/ },
];

export function validateSceneCode(
  filePath: string,
  expectedComponentName: string
): ValidationResult {
  const errors: string[] = [];
  const code = fs.readFileSync(filePath, 'utf-8');
  const lines = code.split(/\r?\n/);

  if (lines.length > 220) {
    errors.push(`File too long: ${lines.length} lines (max 220).`);
  }

  // Check imports
  const importRegex = /^\s*import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    const mod = match[1];
    if (!ALLOWED_IMPORTS.has(mod)) {
      errors.push(`Disallowed import "${mod}". Only react, remotion, and @kit are allowed.`);
    }
  }

  // Check side-effect imports
  const sideEffectImportRegex = /^\s*import\s+['"]([^'"]+)['"]\s*;?/gm;
  while ((match = sideEffectImportRegex.exec(code)) !== null) {
    errors.push(`Disallowed side-effect import "${match[1]}".`);
  }

  // Check forbidden APIs
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.regex.test(code)) {
      errors.push(`Forbidden API used: ${rule.name}`);
    }
  }

  // Check expected export
  const exportRegex = new RegExp(`export\\s+(const|function)\\s+${expectedComponentName}\\b`);
  if (!exportRegex.test(code)) {
    errors.push(`Missing named export "${expectedComponentName}".`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Run tsc --noEmit
  try {
    execFileSync('npx', ['tsc', '--noEmit'], {
      cwd: SPIKE_ROOT,
      stdio: 'pipe',
      shell: true,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    const out = [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('\n');
    errors.push(`TypeScript error:\n${out.slice(0, 1500)}`);
    return { ok: false, errors };
  }

  return { ok: true, errors: [] };
}
