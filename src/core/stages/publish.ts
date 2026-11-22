import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { getProjectDir } from '@core/project/store';

export interface PublishValidationResult {
  ok: boolean;
  unknownUrls: string[];
}

/**
 * Verifies that every URL in publish.md is present in the project's fact-ledger.json.
 */
export function validatePublishSources(
  publishMd: string,
  ledger: FactLedger
): PublishValidationResult {
  const allowedUrls = new Set(
    ledger.claims.flatMap((c) => c.sources.map((s) => s.url.trim()))
  );
  const rawUrls = publishMd.match(/https?:\/\/[^\s\]>"']+/g) ?? [];
  const foundUrls = rawUrls.map((u) => {
    let cleaned = u.replace(/[.,;:!?]+$/, '');
    if (cleaned.endsWith(')') && !cleaned.includes('(')) {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  });
  const unknownUrls = foundUrls.filter((u) => !allowedUrls.has(u.trim()));
  return {
    ok: unknownUrls.length === 0,
    unknownUrls,
  };
}

/**
 * Generates publish.md strictly from script + verified ledger sources (no new claims).
 * Should only be called after S12 final QC passes.
 */
export async function generatePublishMarkdown(
  projectId: string,
  topic: string,
  repoRoot = process.cwd()
): Promise<string> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const script = JSON.parse(
    await readFile(path.join(projectDir, 'script.json'), 'utf-8')
  ) as Script;
  const ledger = JSON.parse(
    await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;

  const firstSentences = script.scenes
    .slice(0, 2)
    .flatMap((s) => s.sentences.map((st) => st.text))
    .slice(0, 3)
    .join(' ');

  const sourceMap = new Map<string, { title: string; url: string; retrieved_at: string }>();
  for (const c of ledger.claims) {
    if (c.status !== 'verified') continue;
    for (const src of c.sources) {
      if (!sourceMap.has(src.url)) {
        sourceMap.set(src.url, {
          title: src.title,
          url: src.url,
          retrieved_at: src.retrieved_at,
        });
      }
    }
  }
  const sourceLines = [...sourceMap.values()].map(
    (s) => `- ${s.title} — ${s.url} (diakses ${s.retrieved_at.slice(0, 10)})`
  );

  const md = `# Publish Info — ${topic}

## Usulan Judul
${topic}

## Deskripsi
${firstSentences}

## Daftar Sumber
${sourceLines.join('\n')}

## Kredit
- Suara Narasi (TTS): Microsoft Edge TTS (\`id-ID-ArdiNeural\`)
- Efek Suara (SFX): \`remotion/public/sfx/\` (MIT License, sintesis FFmpeg)
- Font: Inter, Poppins (SIL Open Font License 1.1)
- Mesin Visual: Remotion + Three.js / React Three Fiber (MIT / Remotion License)

## Catatan Transparansi
Narasi memakai suara sintetis (TTS); visual adalah animasi kode.
`;

  const check = validatePublishSources(md, ledger);
  if (!check.ok) {
    throw new Error(`PUBLISH_UNKNOWN_SOURCE: URL di luar ledger: ${check.unknownUrls.join(', ')}`);
  }

  const outPath = path.join(projectDir, 'publish.md');
  await writeFile(outPath, md, 'utf-8');
  return outPath;
}
