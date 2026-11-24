import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import { ScriptSchema, type Script } from '@core/contracts/script';
import { generateJson } from '@core/llm/client';
import {
  getProjectDir,
  incrementProjectLlmCalls,
  loadProject,
  saveProject,
} from '@core/project/store';
import { checkScriptClarity } from '@core/qc/l0b-clarity';
import {
  checkKeyStepsCoverage,
  L3SentenceEvalSchema,
} from '@core/qc/l0b-quality';
import { verifyScriptL2 } from '@core/qc/l2-script';
import type { Concept } from '@core/stages/ideate';

export interface ScriptSentenceEdit {
  ref: string;
  text: string;
  claims?: string[];
}

export interface EditLogEntry {
  ref: string;
  before: string;
  after: string;
  claims_before: string[];
  claims_after: string[];
  timestamp: string;
}

const L3EditOutputSchema = z.object({
  evaluations: z.array(L3SentenceEvalSchema),
});

export function parseMarkdownScriptEdits(
  markdown: string,
  currentScript: Script
): ScriptSentenceEdit[] {
  const currentByRef = new Map<string, { text: string; claims: string[] }>();
  for (const sc of currentScript.scenes) {
    sc.sentences.forEach((s, idx) => {
      currentByRef.set(`${sc.id}.${idx + 1}`, { text: s.text, claims: s.claim_refs });
    });
  }

  const edits: ScriptSentenceEdit[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const m = rawLine.match(/^\s*(S\d+\.\d+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const ref = m[1]!;
    const newText = m[2]!;
    const prev = currentByRef.get(ref);
    if (!prev) {
      throw new Error(`Referensi kalimat tidak ditemukan di script.json: ${ref}`);
    }
    if (newText !== prev.text) {
      edits.push({ ref, text: newText });
    }
  }
  return edits;
}

export async function editScriptSentences(params: {
  projectId: string;
  edits: ScriptSentenceEdit[];
  repoRoot?: string;
  generateJsonFn?: typeof generateJson;
}): Promise<{
  editedRefs: string[];
  l2Report: QcReport;
  l0bIssues: QcIssue[];
  l3Report: QcReport;
  hasErrors: boolean;
}> {
  const repoRoot = params.repoRoot ?? process.cwd();
  if (params.edits.length === 0) {
    throw new Error('Tidak ada kalimat yang berubah untuk disunting.');
  }

  const projectDir = getProjectDir(params.projectId, repoRoot);
  const project = await loadProject(params.projectId, repoRoot);
  const script = ScriptSchema.parse(
    JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8'))
  );
  const ledger = JSON.parse(
    await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;

  let concept: Concept | undefined;
  try {
    const sel = JSON.parse(
      await readFile(path.join(projectDir, 'selected-concept.json'), 'utf-8')
    ) as { concept: Concept };
    concept = sel.concept;
  } catch {
    concept = undefined;
  }

  const nowIso = new Date().toISOString();
  const logEntries: EditLogEntry[] = [];
  const editedRefSet = new Set<string>();

  for (const edit of params.edits) {
    const m = edit.ref.match(/^(S\d+)\.(\d+)$/);
    if (!m) throw new Error(`Format referensi tidak valid (gunakan mis. S3.3): ${edit.ref}`);
    const sceneId = m[1]!;
    const sentIdx = Number(m[2]!) - 1;
    const scene = script.scenes.find((s) => s.id === sceneId);
    const sent = scene?.sentences[sentIdx];
    if (!sent) throw new Error(`Kalimat ${edit.ref} tidak ditemukan di script.json`);

    const beforeText = sent.text;
    const claimsBefore = [...sent.claim_refs];
    const claimsAfter = edit.claims ? [...edit.claims] : [...sent.claim_refs];

    sent.text = edit.text.trim();
    delete sent.spoken_text;
    if (edit.claims) {
      sent.claim_refs = claimsAfter;
      sent.non_factual = claimsAfter.length === 0;
    }

    editedRefSet.add(edit.ref);
    logEntries.push({
      ref: edit.ref,
      before: beforeText,
      after: sent.text,
      claims_before: claimsBefore,
      claims_after: claimsAfter,
      timestamp: nowIso,
    });
  }

  await writeFile(path.join(projectDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');
  await appendFile(
    path.join(projectDir, 'edits.jsonl'),
    logEntries.map((e) => JSON.stringify(e)).join('\n') + '\n',
    'utf-8'
  );

  const qcDir = path.join(projectDir, 'qc');
  await mkdir(qcDir, { recursive: true });
  const readQc = async <T extends QcReport>(file: string, layer: QcReport['layer']): Promise<T> => {
    try {
      return JSON.parse(await readFile(path.join(qcDir, file), 'utf-8')) as T;
    } catch {
      return { layer, issues: [] } as unknown as T;
    }
  };

  // 1. Re-check L2 only for edited sentences (deterministic, 0 LLM calls)
  const fullL2 = verifyScriptL2(script, ledger, project.target_duration_sec);
  const prevL2 = await readQc<QcReport>('L2.json', 'L2');
  const l2Report: QcReport = {
    layer: 'L2',
    issues: [
      ...prevL2.issues.filter((i) => !editedRefSet.has(i.ref) && i.ref !== 'script'),
      ...fullL2.issues.filter((i) => editedRefSet.has(i.ref) || i.ref === 'script'),
    ],
  };
  await writeFile(path.join(qcDir, 'L2.json'), JSON.stringify(l2Report, null, 2), 'utf-8');

  // 2. Re-check L0b clarity only for edited sentences (+ key_steps coverage)
  const prevL0b = await readQc<QcReport & Record<string, unknown>>('L0b.json', 'L0b');
  const stepNames = new Set(concept?.key_steps ?? []);
  const newClarity = checkScriptClarity(script, {
    keySteps: concept?.key_steps,
    ledger,
    onlyRefs: editedRefSet,
  });
  const stepCov = checkKeyStepsCoverage(concept?.key_steps, script, ledger);
  const l0bIssues: QcIssue[] = [
    ...prevL0b.issues.filter(
      (i) => !editedRefSet.has(i.ref) && !stepNames.has(i.ref) && !i.message.startsWith('L0B_STEP_MISSING')
    ),
    ...stepCov.issues,
    ...newClarity,
  ];
  await writeFile(
    path.join(qcDir, 'L0b.json'),
    JSON.stringify({ ...prevL0b, layer: 'L0b', issues: l0bIssues }, null, 2),
    'utf-8'
  );

  // 3. Re-verify L3 ONLY for edited sentences (1 LLM call total)
  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));
  const editedItems = [...editedRefSet].map((ref) => {
    const [scId, idxStr] = ref.split('.');
    const sent = script.scenes.find((s) => s.id === scId)!.sentences[Number(idxStr) - 1]!;
    return {
      ref,
      non_factual: Boolean(sent.non_factual),
      text: sent.text,
      claims: sent.claim_refs
        .map((cid) => claimMap.get(cid))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({
          id: c.id,
          claim_text: c.text,
          quotes: c.sources.map((s) => s.quote).filter(Boolean),
        })),
    };
  });

  const genFn = params.generateJsonFn ?? generateJson;
  const l3Prompt = `Verifikasi ulang HANYA kalimat yang disunting berikut terhadap kutipan sumbernya (L3 strict):
${JSON.stringify(editedItems, null, 2)}

Aturan verdict:
- "supported": didukung langsung oleh quotes tanpa mengubah makna dan tanpa menghilangkan kata hedge/peluang.
- "overstated": menggeneralisasi berlebihan atau mengubah kuantitas/cakupan.
- "unsupported": bertentangan atau tidak didukung quotes.
- "non_factual_assertion": non_factual:true tetapi berisi pernyataan faktual/penilaian (kalimat tanya retoris murni adalah "supported").`;

  const l3Res = await genFn(L3EditOutputSchema, l3Prompt, {
    stage: 'S4',
    purpose: 'l3_edit_verify',
    projectDir,
    temperature: 0.1,
  });
  await incrementProjectLlmCalls(params.projectId, 'S4', 1, repoRoot);

  const prevL3 = await readQc<QcReport>('L3.json', 'L3');
  const newL3Issues: QcIssue[] = [];
  for (const ev of l3Res.data.evaluations) {
    if (!editedRefSet.has(ev.ref)) continue;
    if (ev.verdict === 'unsupported' || ev.verdict === 'overstated') {
      newL3Issues.push({
        severity: 'error',
        message: `L3_${ev.verdict.toUpperCase()}: ${ev.reason}`,
        ref: ev.ref,
      });
    } else if (ev.verdict === 'non_factual_assertion') {
      const item = editedItems.find((it) => it.ref === ev.ref);
      const isPureQ = item?.non_factual && item.text.trim().endsWith('?') && !/\d/.test(item.text);
      if (!isPureQ) {
        newL3Issues.push({
          severity: 'error',
          message: `NON_FACTUAL_ASSERTION: ${ev.reason}`,
          ref: ev.ref,
        });
      }
    }
  }
  const l3Report: QcReport = {
    layer: 'L3',
    issues: [...prevL3.issues.filter((i) => !editedRefSet.has(i.ref)), ...newL3Issues],
  };
  await writeFile(path.join(qcDir, 'L3.json'), JSON.stringify(l3Report, null, 2), 'utf-8');

  const hasErrors =
    l2Report.issues.some((i) => i.severity === 'error') ||
    l0bIssues.some((i) => i.severity === 'error') ||
    l3Report.issues.some((i) => i.severity === 'error');

  const updatedProj = await loadProject(params.projectId, repoRoot);
  updatedProj.stages.S4 = 'needs_review';
  await saveProject(updatedProj, repoRoot);

  return {
    editedRefs: [...editedRefSet],
    l2Report,
    l0bIssues,
    l3Report,
    hasErrors,
  };
}
