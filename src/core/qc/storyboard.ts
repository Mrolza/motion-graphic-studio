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
import { extractNumericValuesFromText } from '@core/qc/l1-ledger';

function collectTextValues(obj: Record<string, unknown>): string {
  return Object.values(obj)
    .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
    .join(' ');
}

/**
 * Deterministic code checks for Storyboard (S7).
 */
export function verifyStoryboardCode(
  storyboard: Storyboard,
  script: Script,
  timeline: Timeline,
  ledger: FactLedger
): QcReport {
  const issues: QcIssue[] = [];
  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));
  const tlSceneMap = new Map(timeline.scenes.map((s) => [s.scene_id, s]));
  const scriptSceneMap = new Map(script.scenes.map((s) => [s.id, s]));

  if (storyboard.scenes.length !== script.scenes.length) {
    issues.push({
      severity: 'error',
      message: `SB_SCENE_COUNT: jumlah adegan storyboard (${storyboard.scenes.length}) != naskah (${script.scenes.length})`,
      ref: 'storyboard',
    });
  }

  for (const sbScene of storyboard.scenes) {
    const ref = sbScene.id;
    const tlScene = tlSceneMap.get(sbScene.id);
    const scScene = scriptSceneMap.get(sbScene.id);

    if (!tlScene || !scScene) {
      issues.push({
        severity: 'error',
        message: `SB_UNKNOWN_SCENE: adegan "${sbScene.id}" tidak ditemukan di script/timeline`,
        ref,
      });
      continue;
    }

    const expectedDur = Number((tlScene.end - tlScene.start).toFixed(3));
    if (Math.abs(sbScene.duration_sec - expectedDur) > 0.15) {
      issues.push({
        severity: 'error',
        message: `SB_DURATION_MISMATCH: durasi ${sbScene.duration_sec}s != timeline ${expectedDur}s`,
        ref,
      });
    }

    const sceneNarration = scScene.sentences
      .map((s) => `${s.text} ${s.spoken_text ?? ''}`)
      .join(' ')
      .toLowerCase();

    if (sbScene.trigger_words.length === 0) {
      issues.push({
        severity: 'error',
        message: 'SB_EMPTY_TRIGGER: trigger_words tidak boleh kosong',
        ref,
      });
    } else {
      for (const tw of sbScene.trigger_words) {
        if (!sceneNarration.includes(tw.toLowerCase().trim())) {
          issues.push({
            severity: 'error',
            message: `SB_MISSING_TRIGGER_WORD: kata pemicu "${tw}" tidak ada di narasi adegan ${sbScene.id}`,
            ref,
          });
        }
      }
    }

    if (sbScene.focus_entities.length === 0) {
      issues.push({ severity: 'error', message: 'SB_NO_FOCUS_ENTITY: focus_entities kosong', ref });
    }
    if (!sbScene.visible_parts || sbScene.visible_parts.length === 0) {
      issues.push({ severity: 'error', message: 'SB_NO_VISIBLE_PARTS: visible_parts wajib diisi', ref });
    }

    if (sbScene.hud.length > 2) {
      issues.push({
        severity: 'error',
        message: `SB_HUD_BUDGET: ${sbScene.hud.length} panel HUD di ${sbScene.id} (maks 2)`,
        ref,
      });
    }

    for (const h of sbScene.hud) {
      const propText = collectTextValues(h.props);
      if (/\(C\d+\)/.test(propText)) {
        issues.push({
          severity: 'error',
          message: `SB_HUD_CLAIM_ID_LEAK: teks HUD "${propText}" membocorkan ID klaim`,
          ref,
        });
      }
      if (/\b\d{1,3}(?:,\d{3})+\b/.test(propText)) {
        issues.push({
          severity: 'error',
          message: `SB_HUD_FORMAT_NOT_ID: teks HUD "${propText}" memakai pemisah ribuan non-Indonesia`,
          ref,
        });
      }

      const nums = extractNumericValuesFromText(propText);
      const dMin = sbScene.driver ? Math.min(sbScene.driver.from, sbScene.driver.to) : 0;
      const dMax = sbScene.driver ? Math.max(sbScene.driver.from, sbScene.driver.to) : 0;
      const isDriverStat =
        h.component === 'StatCounter' &&
        Boolean(sbScene.driver) &&
        (h.bind_to_driver === true || nums.every((n) => n === 0 || (n >= dMin && n <= dMax)));
      const needsClaim = nums.length > 0 && !isDriverStat && !h.illustrative;

      if (h.claim_ref) {
        const claim = claimMap.get(h.claim_ref);
        if (!claim || claim.status !== 'verified') {
          issues.push({
            severity: 'error',
            message: `SB_UNVERIFIED_CLAIM: claim_ref "${h.claim_ref}" tidak ditemukan atau belum verified`,
            ref,
          });
        } else if (nums.length > 0 && !isDriverStat) {
          const allowedNums = new Set<number>([
            ...(claim.value !== undefined ? [claim.value] : []),
            ...extractNumericValuesFromText(claim.text),
            ...claim.sources.flatMap((s) => extractNumericValuesFromText(s.quote)),
          ]);
          for (const n of nums) {
            if (![...allowedNums].some((a) => Math.abs(a - n) < 1e-4)) {
              issues.push({
                severity: 'error',
                message: `SB_HUD_NUMBER_NOT_IN_CLAIM: angka ${n} di HUD "${propText}" tidak ada di klaim ${h.claim_ref}`,
                ref,
              });
            }
          }
        }
      } else if (needsClaim) {
        issues.push({
          severity: 'error',
          message: `SB_HUD_MISSING_CLAIM: HUD "${h.component}" memuat angka (${nums.join(', ')}) tanpa claim_ref/bind_to_driver/illustrative`,
          ref,
        });
      }
    }

    if (sbScene.invariants && sbScene.invariants.length > 0) {
      if (!sbScene.driver) {
        issues.push({
          severity: 'error',
          message: 'SB_INVARIANT_NO_DRIVER: invariants dideklarasikan tanpa driver',
          ref,
        });
      } else {
        const dMin = Math.min(sbScene.driver.from, sbScene.driver.to);
        const dMax = Math.max(sbScene.driver.from, sbScene.driver.to);
        for (const inv of sbScene.invariants) {
          const [iMin, iMax] = inv.when.driver_between;
          if (iMax < dMin || iMin > dMax) {
            issues.push({
              severity: 'error',
              message: `SB_INVARIANT_OUT_OF_RANGE: rentang [${iMin},${iMax}] di luar driver [${dMin},${dMax}]`,
              ref,
            });
          }
        }
      }
    }
  }

  return { layer: 'L4', issues };
}

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
 * Runs S7 QC (code + 1 LLM consistency check), rewriting storyboard at most 1 time on error.
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

    const checkOnce = async (sb: Storyboard): Promise<QcReport> => {
      const codeRep = verifyStoryboardCode(sb, script, timeline, ledger);
      const llmRes = await generateJson(
        StoryboardLlmReviewSchema,
        `Periksa konsistensi visual storyboard terhadap naskah dan klaim verified:\n` +
          `1. Apakah rencana visual & komponen tiap adegan konsisten dengan klaim yang dirujuk (mis. flens di sisi dalam, piston turun saat hisap)?\n` +
          `2. Apakah visual menjelaskan kalimat narasi adegan itu (bukan sekadar dekorasi)?\n\n` +
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
      return { layer: 'L4', issues: [...codeRep.issues, ...llmIssues] };
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
          .join('\n')}\n\nATURAN PERBAIKAN: Setiap item di hud[] yang menyebut angka apa pun (termasuk "4 Tak", "2", "1:20") WAJIB memiliki "claim_ref": "<ID klaim verified>" atau "bind_to_driver": true (wajib untuk StatCounter) atau "illustrative": true.\n\nStoryboard lama:\n${JSON.stringify(storyboard, null, 2)}\n\nTimeline:\n${JSON.stringify(
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
