import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  ClaimKindSchema,
  type FactClaim,
  type FactLedger,
} from '@core/contracts/fact-ledger';
import type { QcReport } from '@core/contracts/qc-report';
import { generateJson } from '@core/llm/client';
import {
  getProjectDir,
  incrementProjectLlmCalls,
  loadProject,
  saveProject,
} from '@core/project/store';
import { evaluateL0, verifyLedgerL1 } from '@core/qc/l1-ledger';
import {
  fetchTodayInHistorySources,
  fetchWikipediaSourcesForConcept,
  type WikipediaSource,
} from '@core/research/wikipedia';
import type { Concept, ConceptsOutput } from '@core/stages/ideate';

const ExtractedClaimSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
  value: z.number().nullish(),
  unit: z.string().min(1).nullish(),
  kind: ClaimKindSchema,
  source_id: z.string().min(1),
  quote: z.string().min(1),
  supports_core_claim_indices: z.array(z.number().int().nonnegative()).optional(),
});

const ExtractionResponseSchema = z.object({
  claims: z.array(ExtractedClaimSchema).min(1),
});

export interface ResearchStageResult {
  concept: Concept;
  sources: WikipediaSource[];
  ledger: FactLedger;
  l1Report: QcReport;
  l0Report: QcReport;
  l0Passed: boolean;
}

export async function runResearchStage(
  projectId: string,
  options?: { conceptIndex?: number; repoRoot?: string }
): Promise<ResearchStageResult> {
  const repoRoot = options?.repoRoot ?? process.cwd();
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  project.stages.S2 = 'running';
  await saveProject(project, repoRoot);

  const conceptsRaw = await readFile(path.join(projectDir, 'concepts.json'), 'utf-8');
  const { concepts } = JSON.parse(conceptsRaw) as ConceptsOutput;
  const idx = Math.max(0, Math.min(concepts.length - 1, options?.conceptIndex ?? 0));
  const concept = concepts[idx]!;

  let llmCallsThisRun = 0;
  try {
    let sources: WikipediaSource[];
    if (project.format === 'today_in_history') {
      const mmDdMatch = project.topic.match(/\b(\d{2}-\d{2})\b/);
      const mmDd = mmDdMatch?.[1] ?? '07-20';
      const hist = await fetchTodayInHistorySources(mmDd, 4);
      sources = hist.sources;
    } else {
      const keywords = [
        ...concept.search_queries,
        ...concept.core_claims.flatMap((c) => c.split(/\s+/).filter((w) => w.length > 4)),
      ];
      sources = await fetchWikipediaSourcesForConcept({
        queries: [...concept.search_queries, project.topic],
        keywords,
        maxPages: 4,
      });
    }

    if (sources.length === 0) {
      throw new Error(`No Wikipedia sources found for concept "${concept.title}"`);
    }

    const sourcesDir = path.join(projectDir, 'sources');
    await mkdir(sourcesDir, { recursive: true });
    for (const s of sources) {
      await writeFile(path.join(sourcesDir, `${s.source_id}.json`), JSON.stringify(s, null, 2), 'utf-8');
    }

    // Split into max 2 batches if total source text > 32,000 chars
    const totalChars = sources.reduce((sum, s) => sum + s.text.length, 0);
    const batches: WikipediaSource[][] =
      totalChars > 32_000 && sources.length > 1
        ? [sources.slice(0, Math.ceil(sources.length / 2)), sources.slice(Math.ceil(sources.length / 2))]
        : [sources];

    const allRawClaims: Array<z.infer<typeof ExtractedClaimSchema>> = [];
    const systemInstruction = `Anda adalah ekstraktor fakta ketat. Tugas Anda mengekstrak klaim faktual dari teks sumber Wikipedia yang diberikan.
ATURAN MUTLAK:
1. "quote" HARUS disalin KARAKTER-DEMI-KARAKTER (verbatim substring) dari teks sumber dengan "source_id" yang sesuai. JANGAN memparafrasekan, meringkas, atau mengubah angka di dalam "quote".
2. "text" ditulis dalam bahasa Indonesia yang jelas.
3. "kind" WAJIB salah satu dari: "fact", "estimate", "hypothetical", "interpretation" (gunakan "fact" untuk fakta langsung; JANGAN pakai "factual" atau "entity").
4. Jika klaim menyebut angka penting (ukuran, tahun, kecepatan, suhu, persentase), isi "value" (angka murni) dan "unit". Jika tidak ada angka, hilangkan "value" dan "unit" (jangan diisi null).
5. Isi "supports_core_claim_indices" (array indeks 0-based core_claims yang didukung klaim ini).
6. Ekstrak 6-12 klaim paling relevan yang mencakup semua core_claims.`;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx]!;
      const sourceBlock = batch
        .map(
          (s) =>
            `=== SOURCE ${s.source_id} (${s.lang}: ${s.title}) ===\n${s.text.slice(0, 16_000)}`
        )
        .join('\n\n');

      const prompt = `Konsep: "${concept.title}"
Core claims yang harus diverifikasi (indeks 0..${concept.core_claims.length - 1}):
${concept.core_claims.map((c, i) => `[${i}] ${c}`).join('\n')}

Sumber:
${sourceBlock}

Kembalikan JSON { "claims": [...] }.`;

      const res = await generateJson(ExtractionResponseSchema, prompt, {
        stage: 'S2',
        systemInstruction,
        onCallRecord: () => {
          llmCallsThisRun++;
        },
      });
      allRawClaims.push(...res.data.claims);
    }

    const sourceById = new Map(sources.map((s) => [s.source_id, s]));
    const claimSourceIds: Record<string, string> = {};
    const coreMapping: Record<number, string[]> = {};

    const claims: FactClaim[] = allRawClaims.map((rc, i) => {
      const id = `C${i + 1}`;
      claimSourceIds[id] = rc.source_id;
      for (const cIdx of rc.supports_core_claim_indices ?? []) {
        coreMapping[cIdx] = coreMapping[cIdx] ?? [];
        coreMapping[cIdx]!.push(id);
      }
      const src = sourceById.get(rc.source_id);
      return {
        id,
        text: rc.text,
        value: rc.value ?? undefined,
        unit: rc.unit ?? undefined,
        kind: rc.kind,
        status: 'unverified',
        sources: [
          {
            url: src?.url ?? 'https://wikipedia.org',
            title: src?.title ?? rc.source_id,
            quote: rc.quote,
            retrieved_at: src?.retrieved_at ?? new Date().toISOString(),
          },
        ],
      };
    });

    const l1 = verifyLedgerL1(claims, sources, claimSourceIds);
    const l0 = evaluateL0(concept.core_claims, l1.ledger.claims, coreMapping);

    const qcDir = path.join(projectDir, 'qc');
    await mkdir(qcDir, { recursive: true });
    await writeFile(path.join(projectDir, 'fact-ledger.json'), JSON.stringify(l1.ledger, null, 2), 'utf-8');
    await writeFile(path.join(qcDir, 'L1.json'), JSON.stringify(l1.report, null, 2), 'utf-8');
    await writeFile(path.join(qcDir, 'L0.json'), JSON.stringify(l0.report, null, 2), 'utf-8');
    await writeFile(
      path.join(projectDir, 'selected-concept.json'),
      JSON.stringify({ index: idx, concept }, null, 2),
      'utf-8'
    );

    await incrementProjectLlmCalls(projectId, 'S2', llmCallsThisRun, repoRoot);
    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S2 = l0.passed ? 'done' : 'needs_review';
    await saveProject(updated, repoRoot);

    return {
      concept,
      sources,
      ledger: l1.ledger,
      l1Report: l1.report,
      l0Report: l0.report,
      l0Passed: l0.passed,
    };
  } catch (err) {
    if (llmCallsThisRun > 0) {
      await incrementProjectLlmCalls(projectId, 'S2', llmCallsThisRun, repoRoot).catch(() => {});
    }
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S2 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
