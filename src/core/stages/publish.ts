import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { getProjectDir } from '@core/project/store';
import { detectHedgeAndAbsoluteMismatches } from '@core/qc/hedge-glossary';

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
    ledger.claims
      .filter((c) => c.status === 'verified')
      .flatMap((c) => c.sources.map((s) => s.url.trim()))
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
 * Checks publish.md description text against verified ledger quotes for dropped hedges or added absolutes.
 */
export function validatePublishHedges(
  publishMd: string,
  ledger: FactLedger,
  script?: Script
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const verifiedClaims = ledger.claims.filter((c) => c.status === 'verified');
  const claimMap = new Map(verifiedClaims.map((c) => [c.id, c]));
  const descMatch = publishMd.match(/##\s*Deskripsi\s*\r?\n([\s\S]*?)(?:\r?\n##\s|$)/i);
  const descText = (descMatch?.[1] ?? publishMd).trim();
  const sentences = descText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (script) {
    const scriptSents = script.scenes.flatMap((sc) => sc.sentences);
    for (const s of sentences) {
      const matched = scriptSents.find((ss) => ss.text.trim() === s);
      if (!matched || matched.claim_refs.length === 0) continue;
      const quotes = matched.claim_refs
        .map((id) => claimMap.get(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .flatMap((c) => c.sources.map((src) => src.quote))
        .join(' ');
      if (!quotes) continue;
      const { hedgeDropped, absoluteAdded } = detectHedgeAndAbsoluteMismatches(s, quotes);
      if (hedgeDropped.length > 0) {
        errors.push(`L2_HEDGE_DROPPED: publish.md membuang kata lunak pada "${s}"`);
      }
      if (absoluteAdded.length > 0) {
        errors.push(`L2_ABSOLUTE_ADDED: publish.md menambah kata mutlak (${absoluteAdded.join(', ')}) pada "${s}"`);
      }
    }
  } else {
    const allQuotes = verifiedClaims.flatMap((c) => c.sources.map((s) => s.quote)).join(' ');
    for (const s of sentences) {
      const { hedgeDropped, absoluteAdded } = detectHedgeAndAbsoluteMismatches(s, allQuotes);
      if (hedgeDropped.length > 0) {
        errors.push(`L2_HEDGE_DROPPED: publish.md membuang kata lunak pada "${s}"`);
      }
      if (absoluteAdded.length > 0) {
        errors.push(`L2_ABSOLUTE_ADDED: publish.md menambah kata mutlak (${absoluteAdded.join(', ')}) pada "${s}"`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
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
