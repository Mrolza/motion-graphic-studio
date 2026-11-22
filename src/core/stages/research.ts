import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ClaimKindSchema, type FactClaim, type FactLedger } from '@core/contracts/fact-ledger';
import type { QcReport } from '@core/contracts/qc-report';
import { generateJson } from '@core/llm/client';
import {
  getProjectDir,
  incrementProjectLlmCalls,
  loadProject,
  saveProject,
} from '@core/project/store';
import { evaluateL0, verifyLedgerL1 } from '@core/qc/l1-ledger';
import { reparaphraseFailedClaims, verifyLedgerL1Semantic } from '@core/qc/l1-semantic';
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
  step_id: z.string().min(1).nullish(),
  source_id: z.string().min(1),
  quote: z.string().min(1),
  supports_core_claim_indices: z.array(z.number().int().nonnegative()).optional(),
});

const SourceEvalSchema = z.object({
  source_id: z.string().min(1),
  relevance: z.enum(['relevant', 'partial', 'irrelevant']),
  reason: z.string().optional(),
});

const ExtractionResponseSchema = z.object({
  source_evaluations: z.any().optional(),
  claims: z.array(ExtractedClaimSchema).min(1),
});

const FollowUpQuerySchema = z.object({
  wiki_titles: z
    .object({
      en: z.array(z.string().min(1)).max(4).optional().default([]),
      id: z.array(z.string().min(1)).max(3).optional().default([]),
    })
    .optional(),
  search_queries: z.array(z.string().min(1)).max(4).optional().default([]),
});

export interface SourceReportEntry {
  source_id: string;
  title: string;
  lang: string;
  url: string;
  relevance: 'relevant' | 'partial' | 'irrelevant';
  reason: string;
  kept: boolean;
}

export interface ResearchStageResult {
  concept: Concept;
  sources: WikipediaSource[];
  sourceReport: SourceReportEntry[];
  ledger: FactLedger;
  l1Report: QcReport;
  l0Report: QcReport;
  l0Passed: boolean;
}

async function extractClaimsFromSources(params: {
  topic: string;
  concept: Concept;
  sources: WikipediaSource[];
  coreIndices?: number[];
  projectDir?: string;
  onCall: () => void;
}) {
  const { topic, concept, sources, projectDir, onCall } = params;
  const totalChars = sources.reduce((sum, s) => sum + s.text.length, 0);
  const batches: WikipediaSource[][] =
    totalChars > 32_000 && sources.length > 1
      ? [sources.slice(0, Math.ceil(sources.length / 2)), sources.slice(Math.ceil(sources.length / 2))]
      : [sources];

  const systemInstruction = `Anda adalah ekstraktor fakta ketat. Tugas Anda menilai relevansi tiap sumber terhadap pertanyaan topik dan mengekstrak klaim faktual.
ATURAN MUTLAK:
1. Nilai setiap sumber di "source_evaluations": "relevant" (menjawab langsung), "partial" (terkait sebagian), atau "irrelevant" (menyimpang/tidak menjawab topik, misalnya membahas satu kereta tertentu padahal topik menanyakan mekanisme umum).
2. "quote" HARUS berupa KALIMAT UTUH (diawali huruf kapital/awal kalimat dan diakhiri tanda baca titik/tanda tanya/seru) yang disalin KARAKTER-DEMI-KARAKTER dari teks sumber dengan "source_id" yang sesuai. JANGAN memotong frasa di tengah kalimat. JANGAN menyisipkan angka, tahun, tanggal, atau nama depan/tokoh dari kalimat lain: setiap angka/tahun/tanggal dan nama diri di "text" WAJIB benar-benar muncul di "quote" tersebut (mis. jika kutipan hanya menyebut "Armstrong", tulis "Armstrong", bukan "Neil Armstrong"). Pastikan ada klaim yang kutipannya memuat tanggal dan tahun lengkap secara eksplisit bila relevan dengan topik.
3. "text" ditulis dalam bahasa Indonesia yang jelas. PERTAHANKAN kata hedge/peluang dari kutipan (mis. "most"->"sebagian besar", "less chance"->"peluang lebih kecil", "about"->"sekitar", "may"->"dapat") dan JANGAN menambahkan kata mutlak ("tanpa", "selalu", "pasti", "terus", "semua") jika tidak ada di kutipan.
4. "kind" WAJIB salah satu dari: "fact", "estimate", "hypothetical", "interpretation".
5. Jika klaim menyebut angka penting, isi "value" (angka murni) dan "unit". Jika tidak ada, hilangkan (jangan null).
6. Isi "supports_core_claim_indices" (array indeks 0-based core_claims yang didukung klaim ini).
7. Jika konsep memiliki "key_steps", untuk setiap klaim yang menjelaskan satu langkah khusus, isi "step_id" persis sesuai nama langkahnya (mis. "Hisap", "Kompresi", "Usaha", "Buang"). Jangan isi step_id untuk klaim daftar yang merangkum >= 3 langkah sekaligus.
8. Selalu ekstrak minimal 4 klaim faktual penting dengan format PERSIS: { "source_evaluations": [{ "source_id": "S1", "relevance": "relevant", "reason": "..." }], "claims": [{ "text": "...", "kind": "fact", "step_id": "Hisap", "source_id": "S1", "quote": "Kalimat utuh persis dari sumber.", "supports_core_claim_indices": [0] }] }.`;

  const rawClaims: Array<z.infer<typeof ExtractedClaimSchema>> = [];
  const sourceEvals = new Map<string, z.infer<typeof SourceEvalSchema>>();

  for (const batch of batches) {
    const perSourceBudget = batch.length <= 2 ? 24_000 : 14_000;
    const sourceBlock = batch
      .map((s) => `=== SOURCE ${s.source_id} (${s.lang}: ${s.title}) ===\n${s.text.slice(0, perSourceBudget)}`)
      .join('\n\n');

    const targetList = (params.coreIndices ?? concept.core_claims.map((_, i) => i))
      .map((i) => `[${i}] ${concept.core_claims[i]}`)
      .join('\n');

    const keyStepsHint =
      concept.key_steps && concept.key_steps.length > 0
        ? `\nKey steps yang wajib punya klaim khusus (step_id): ${JSON.stringify(concept.key_steps)}`
        : '';

    const prompt = `Topik: "${topic}"
Konsep: "${concept.title}"${keyStepsHint}
Core claims target:
${targetList}

Sumber:
${sourceBlock}

Kembalikan JSON { "source_evaluations": [...], "claims": [...] }.`;

    const res = await generateJson(ExtractionResponseSchema, prompt, {
      stage: 'S2',
      purpose: 'extract_claims',
      projectDir,
      systemInstruction,
      onCallRecord: onCall,
    });
    const rawEvals = res.data.source_evaluations;
    if (Array.isArray(rawEvals)) {
      for (const ev of rawEvals) sourceEvals.set(ev.source_id, ev);
    } else if (rawEvals && typeof rawEvals === 'object') {
      for (const [sid, ev] of Object.entries(rawEvals as Record<string, { relevance?: string; reason?: string }>)) {
        const rel = ev.relevance === 'irrelevant' || ev.relevance === 'partial' ? ev.relevance : 'relevant';
        sourceEvals.set(sid, { source_id: sid, relevance: rel, reason: ev.reason });
      }
    }
    rawClaims.push(...res.data.claims);
  }

  return { rawClaims, sourceEvals };
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
  const preferEnglishFirst = project.format !== 'today_in_history';

  let llmCallsThisRun = 0;
  const trackCall = () => {
    llmCallsThisRun++;
  };

  try {
    let sources: WikipediaSource[];
    if (project.format === 'today_in_history') {
      const mmDdMatch = project.topic.match(/\b(\d{2}-\d{2})\b/);
      const hist = await fetchTodayInHistorySources(mmDdMatch?.[1] ?? '07-20', 4, concept.title);
      sources = hist.sources;
      // Ensure primary Wikipedia article for the concept (e.g. "Apollo 11") is also included first if not already present
      if (concept.wiki_titles) {
        const extraPrimary = await fetchWikipediaSourcesForConcept({
          wikiTitles: concept.wiki_titles,
          queries: [],
          keywords: concept.search_queries,
          preferEnglishFirst: true,
          maxPages: 2,
          startIndex: sources.length,
        });
        const existingUrls = new Set(sources.map((s) => s.url));
        const merged = [...extraPrimary.filter((s) => !existingUrls.has(s.url)), ...sources];
        sources = merged.slice(0, 4).map((s, idx) => ({ ...s, source_id: `S${idx + 1}` }));
      }
    } else {
      const keywords = [
        ...concept.search_queries,
        ...concept.core_claims.flatMap((c) => c.split(/\s+/).filter((w) => w.length > 4)),
      ];
      sources = await fetchWikipediaSourcesForConcept({
        wikiTitles: concept.wiki_titles,
        queries: [...concept.search_queries, project.topic],
        keywords,
        preferEnglishFirst,
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

    const firstPass = await extractClaimsFromSources({
      topic: project.topic,
      concept,
      sources,
      projectDir,
      onCall: trackCall,
    });

    const allRawClaims = [...firstPass.rawClaims];
    const allEvals = new Map(firstPass.sourceEvals);

    const buildLedgerAndL0 = (currentSources: WikipediaSource[], rawList: typeof allRawClaims) => {
      const droppedIds = new Set(
        [...allEvals.values()].filter((e) => e.relevance === 'irrelevant').map((e) => e.source_id)
      );
      const sourceById = new Map(currentSources.map((s) => [s.source_id, s]));
      const claimSourceIds: Record<string, string> = {};
      const coreMapping: Record<number, string[]> = {};

      const filteredRaw = rawList.filter((rc) => !droppedIds.has(rc.source_id));
      const activeRaw = filteredRaw.length > 0 ? filteredRaw : rawList;

      const claims: FactClaim[] = activeRaw.map((rc, i) => {
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
          step_id: rc.step_id ?? undefined,
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

      const l1 = verifyLedgerL1(claims, currentSources, claimSourceIds);
      const l0 = evaluateL0(concept.core_claims, l1.ledger.claims, coreMapping);
      return { l1, l0, coreMapping };
    };

    let { l1, l0, coreMapping } = buildLedgerAndL0(sources, allRawClaims);

    // Fixed L0 logic: if any core_claims are unsupported, run ONE targeted follow-up research round
    if (!l0.passed) {
      const missingClaims = l0.report.issues.map((iss) => iss.message);
      const followUpRes = await generateJson(
        FollowUpQuerySchema,
        `Topik: "${project.topic}"\nCore claims yang belum terverifikasi:\n${missingClaims.join(
          '\n'
        )}\n\nSarankan judul artikel Wikipedia Inggris/Indonesia dan query pencarian yang spesifik untuk memverifikasi klaim di atas.`,
        { stage: 'S2', purpose: 'follow_up_query', projectDir, onCallRecord: trackCall }
      );

      const followUpQueries = followUpRes.data.search_queries ?? [];
      const extraSources = await fetchWikipediaSourcesForConcept({
        wikiTitles: followUpRes.data.wiki_titles,
        queries: followUpQueries,
        keywords: followUpQueries,
        preferEnglishFirst: true,
        maxPages: 3,
        startIndex: sources.length,
      });

      const existingUrls = new Set(sources.map((s) => s.url));
      const newSources = extraSources.filter((s) => !existingUrls.has(s.url));
      for (const s of newSources) {
        await writeFile(path.join(sourcesDir, `${s.source_id}.json`), JSON.stringify(s, null, 2), 'utf-8');
      }
      if (newSources.length > 0) {
        sources = [...sources, ...newSources];
      }
      const missingIndices = l0.report.issues
        .map((iss) => {
          const m = iss.ref?.match(/^core_claim_(\d+)$/);
          return m ? Number(m[1]) - 1 : -1;
        })
        .filter((idx) => idx >= 0);
      const retrySources = newSources.length > 0 ? [...newSources, ...sources.slice(0, 1)] : sources.slice(0, 2);
      if (retrySources.length > 0) {
        const secondPass = await extractClaimsFromSources({
          topic: project.topic,
          concept,
          sources: retrySources,
          coreIndices: missingIndices.length > 0 ? missingIndices : undefined,
          projectDir,
          onCall: trackCall,
        });
        for (const [k, v] of secondPass.sourceEvals) {
          if (!allEvals.has(k)) allEvals.set(k, v);
        }
        allRawClaims.push(...secondPass.rawClaims);
        ({ l1, l0, coreMapping } = buildLedgerAndL0(sources, allRawClaims));
      }
    }

    const applySemantic = async () => {
      const sem = await verifyLedgerL1Semantic(l1.ledger.claims, { projectDir, onCall: trackCall });
      if (sem.issues.length === 0) return;
      l1 = {
        ledger: {
          ...l1.ledger,
          claims: l1.ledger.claims.map((c) =>
            sem.unverifiedIds.has(c.id)
              ? { ...c, status: 'unverified', status_reason: sem.reasons.get(c.id) ?? c.status_reason }
              : c
          ),
        },
        report: { ...l1.report, issues: [...l1.report.issues, ...sem.issues] },
      };
      l0 = evaluateL0(concept.core_claims, l1.ledger.claims, coreMapping);
    };
    await applySemantic();

    // A2: Re-paraphrase claims that failed hedge/embellishment checks (1 call, max 1 retry)
    const recoverable = l1.ledger.claims.filter(
      (c) => c.status === 'unverified' && /^(L1_HEDGE_DROPPED|L1_ABSOLUTE_ADDED|L1_EMBELLISHED)/.test(c.status_reason ?? '')
    );
    if (recoverable.length > 0) {
      const fixedTexts = await reparaphraseFailedClaims(recoverable, { projectDir, onCall: trackCall });
      if (fixedTexts.size > 0) {
        const droppedIds = new Set([...allEvals.values()].filter((e) => e.relevance === 'irrelevant').map((e) => e.source_id));
        const activeList = allRawClaims.filter((rc) => !droppedIds.has(rc.source_id));
        const targetList = activeList.length > 0 ? activeList : allRawClaims;
        targetList.forEach((rc, idx) => {
          const updatedText = fixedTexts.get(`C${idx + 1}`);
          if (updatedText) rc.text = updatedText;
        });
        ({ l1, l0, coreMapping } = buildLedgerAndL0(sources, allRawClaims));
        await applySemantic();
      }
    }

    const sourceReport: SourceReportEntry[] = sources.map((s) => {
      const ev = allEvals.get(s.source_id);
      const rel = ev?.relevance ?? 'relevant';
      return {
        source_id: s.source_id,
        title: s.title,
        lang: s.lang,
        url: s.url,
        relevance: rel,
        reason: ev?.reason ?? 'Dipakai dalam ekstraksi klaim.',
        kept: rel !== 'irrelevant',
      };
    });

    const qcDir = path.join(projectDir, 'qc');
    await mkdir(qcDir, { recursive: true });
    await writeFile(path.join(projectDir, 'fact-ledger.json'), JSON.stringify(l1.ledger, null, 2), 'utf-8');
    await writeFile(path.join(projectDir, 'sources-report.json'), JSON.stringify(sourceReport, null, 2), 'utf-8');
    await writeFile(path.join(qcDir, 'L1.json'), JSON.stringify(l1.report, null, 2), 'utf-8');
    await writeFile(path.join(qcDir, 'L0.json'), JSON.stringify(l0.report, null, 2), 'utf-8');
    await writeFile(path.join(projectDir, 'selected-concept.json'), JSON.stringify({ index: idx, concept }, null, 2), 'utf-8');

    await incrementProjectLlmCalls(projectId, 'S2', llmCallsThisRun, repoRoot);
    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S2 = l0.passed ? 'done' : 'needs_review';
    await saveProject(updated, repoRoot);
    return { concept, sources, sourceReport, ledger: l1.ledger, l1Report: l1.report, l0Report: l0.report, l0Passed: l0.passed };
  } catch (err) {
    if (llmCallsThisRun > 0) await incrementProjectLlmCalls(projectId, 'S2', llmCallsThisRun, repoRoot).catch(() => {});
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S2 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
