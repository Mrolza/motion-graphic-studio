import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema, type Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { generateJson } from '@core/llm/client';
import { getProjectDir, incrementProjectLlmCalls, loadProject, saveProject } from '@core/project/store';
import { verifyStoryboardL5Semantic, type L5SemanticVerdict } from './l5-semantic';
import { verifyStoryboardCode } from './storyboard-code';

export { verifyStoryboardCode } from './storyboard-code';

const StoryboardLlmReviewSchema = z.object({
  consistent: z.boolean(),
  issues: z.array(
    z.object({
      scene_id: z.string(),
      severity: z.enum(['error', 'warning']),
      message: z.string(),
    })
  ),
});

/**
 * Runs S7 QC (code + 1 LLM consistency check + 1 L5 semantic check), rewriting storyboard at most 1 time on error.
 */
export async function runStoryboardQcStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<{ storyboard: Storyboard; report: QcReport; rewritten: boolean }> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  project.stages.S7 = 'running';
  await saveProject(project, repoRoot);

  let llmCalls = 0;
  try {
    let storyboard = StoryboardSchema.parse(
      JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8'))
    );
    const script = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
    const timeline = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
    const ledger = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;

    let latestVerdicts: L5SemanticVerdict[] = [];
    const checkOnce = async (sb: Storyboard): Promise<QcReport> => {
      const codeRep = verifyStoryboardCode(sb, script, timeline, ledger);
      const llmRes = await generateJson(
        StoryboardLlmReviewSchema,
        `Periksa konsistensi visual storyboard terhadap naskah dan klaim verified:\n` +
          `1. Apakah rencana visual & komponen tiap adegan konsisten dengan klaim yang dirujuk (mis. flens di sisi dalam, piston turun saat hisap)?\n` +
          `2. Apakah visual menjelaskan kalimat narasi adegan itu (bukan sekadar dekorasi)?\n\n` +
          `Kembalikan JSON dengan format persis: {"consistent": boolean, "issues": [{"scene_id": string, "severity": "error" | "warning", "message": string}]}.\n\n` +
          `Naskah:\n${JSON.stringify(script, null, 2)}\n\nKlaim:\n${JSON.stringify(
            ledger.claims.filter((c) => c.status === 'verified'),
            null,
            2
          )}\n\nStoryboard:\n${JSON.stringify(sb, null, 2)}`,
        {
          stage: 'S7',
          onCallRecord: () => {
            llmCalls++;
          },
        }
      );

      const llmIssues: QcIssue[] = llmRes.data.issues.map((iss) => ({
        severity: iss.severity,
        message: `SB_LLM: ${iss.message}`,
        ref: iss.scene_id,
      }));
      const l5Sem = await verifyStoryboardL5Semantic({
        topic: project.topic,
        storyboard: sb,
        ledger,
        onCall: () => {
          llmCalls++;
        },
      });
      latestVerdicts = l5Sem.verdicts;
      return { layer: 'L4', issues: [...codeRep.issues, ...llmIssues, ...l5Sem.report.issues] };
    };

    let report = await checkOnce(storyboard);
    let rewritten = false;

    const errors = report.issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      rewritten = true;
      const rw = await generateJson(
        StoryboardSchema,
        `Perbaiki storyboard berikut agar lolos semua pemeriksaan (0 error):\n${errors
          .map((e) => `- [${e.ref}] ${e.message}`)
          .join('\n')}\n\nATURAN PERBAIKAN: Setiap item di hud[] yang menyebut angka apa pun WAJIB memiliki "claim_ref": "<ID klaim verified>" atau "bind_to_driver": true atau "illustrative": true. Untuk StatCounter / bind_to_driver: true, WAJIB sertakan di level item hud (bukan hanya di props): "quantity": "crank_angle"|"lateral_shift"|"effective_diameter"|"progress" dan "display": "value"|"qualitative", serta props.label menyebut nama besaran ("Sudut Poros Engkol", "Geser Lateral", atau "Diameter Efektif"). Jangan melebih-lebihkan kutipan (hindari "tanpa"/"Kontinu"/"selalu" jika sumber lunak).\n\nStoryboard lama:\n${JSON.stringify(storyboard, null, 2)}\n\nTimeline:\n${JSON.stringify(
          timeline.scenes,
          null,
          2
        )}\n\nNaskah:\n${JSON.stringify(script, null, 2)}\n\nKlaim verified:\n${JSON.stringify(
          ledger.claims.filter((c) => c.status === 'verified'),
          null,
          2
        )}`,
        {
          stage: 'S7',
          onCallRecord: () => {
            llmCalls++;
          },
        }
      );
      storyboard = rw.data;
      await writeFile(path.join(projectDir, 'storyboard.json'), JSON.stringify(storyboard, null, 2), 'utf-8');
      report = await checkOnce(storyboard);
    }

    const qcDir = path.join(projectDir, 'qc');
    await mkdir(qcDir, { recursive: true });
    await writeFile(path.join(qcDir, 'storyboard.json'), JSON.stringify(report, null, 2), 'utf-8');
    await writeFile(path.join(qcDir, 'l5-semantic.json'), JSON.stringify(latestVerdicts, null, 2), 'utf-8');

    if (llmCalls > 0) await incrementProjectLlmCalls(projectId, 'S7', llmCalls, repoRoot);
    const updated = await loadProject(projectId, repoRoot);
    const hasErr = report.issues.some((i) => i.severity === 'error');
    updated.stages.S7 = hasErr ? 'needs_review' : 'done';
    await saveProject(updated, repoRoot);

    return { storyboard, report, rewritten };
  } catch (err) {
    if (llmCalls > 0) await incrementProjectLlmCalls(projectId, 'S7', llmCalls, repoRoot).catch(() => {});
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S7 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
