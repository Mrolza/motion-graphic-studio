import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { checkQuotaBeforeRun, RunLlmTracker } from '@core/llm/budget';
import { aggregateLlmCallStats, formatRenderTiming } from '@core/llm/stats';
import { getProjectDir, loadProject, resetProjectLastRunCalls, saveProject } from '@core/project/store';
import { runFinalQcStage } from '@core/qc/final';
import { checkKeyStepsCoverage } from '@core/qc/l0b-quality';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { analyzeArrowDirectionFromTelemetry } from '@core/qc/visual/arrow-check';
import type { TelemetrySample } from '@core/qc/visual/types';
import { clearRemotionBundleCache, runVisualQc } from '@core/qc/visual/runner';
import { buildVisualSpecForScene, findTriggerTimeInScene } from '@core/stages/scene-safety';
import { runFinalRenderStage } from '@core/stages/final-render';
import { runIdeateStage } from '@core/stages/ideate';
import { runMixStage } from '@core/stages/mix';
import { generatePublishMarkdown } from '@core/stages/publish';
import { runResearchStage } from '@core/stages/research';
import { runScenesStage } from '@core/stages/scene-coder';
import { runScriptAndQcStage } from '@core/stages/script';
import { runStoryboardStage } from '@core/stages/storyboard';
import { runVoiceStage, tightenExistingVoiceStage } from '@core/stages/voice';

const execFileAsync = promisify(execFile);
const REPO = process.cwd();
const OUT_DIR = path.join(REPO, 'out', 'review', 'p4f');

async function resetMesinStagesForFreshRun(projectId: string, projectDir: string) {
  const proj = await loadProject(projectId, REPO);
  for (const k of Object.keys(proj.stages) as Array<keyof typeof proj.stages>) {
    proj.stages[k] = 'pending';
  }
  await saveProject(proj, REPO);
  for (const rel of [
    'storyboard.meta.json',
    'scenes/cache.json',
    'qc/storyboard-review.meta.json',
    'qc/l5-semantic.meta.json',
  ]) {
    await rm(path.join(projectDir, rel), { force: true }).catch(() => {});
  }
}

async function runMesinP4F(phaseStartIso: string) {
  const projectId = 'p2-mesin4tak';
  const projectDir = getProjectDir(projectId, REPO);
  const outProj = path.join(OUT_DIR, projectId);
  await mkdir(path.join(outProj, 'stills'), { recursive: true });

  await checkQuotaBeforeRun({ estimatedCalls: 18, rpdLimit: 1000, repoRoot: REPO });
  await resetProjectLastRunCalls(projectId, undefined, REPO);
  const tracker = new RunLlmTracker({ projectDir, limit: 20 });

  let renderMs = 0;
  let finalQc: Awaited<ReturnType<typeof runFinalQcStage>>;

  if (process.argv.includes('--collect-only')) {
    finalQc = await runFinalQcStage(projectId, { repoRoot: REPO, videoPath: path.join(projectDir, 'final.mp4') });
  } else {
    if (!process.argv.includes('--resume-from-s6') && !process.argv.includes('--resume-from-s8') && !process.argv.includes('--reverify-s9')) {
      await resetMesinStagesForFreshRun(projectId, projectDir);

      console.log(`[${projectId}] S1 Ideate...`);
      await runIdeateStage(projectId, REPO);

      console.log(`[${projectId}] S2 Research...`);
      await runResearchStage(projectId, { repoRoot: REPO });

      // Ensure key_steps are present for 4-stroke engine process coverage
      const selPath = path.join(projectDir, 'selected-concept.json');
      const sel = JSON.parse(await readFile(selPath, 'utf-8')) as {
        index: number;
        concept: { domain?: string; key_steps?: string[] };
      };
      sel.concept.domain = 'engine';
      if (!sel.concept.key_steps || sel.concept.key_steps.length < 4) {
        sel.concept.key_steps = ['Hisap', 'Kompresi', 'Usaha', 'Buang'];
      }
      await writeFile(selPath, JSON.stringify(sel, null, 2), 'utf-8');

      console.log(`[${projectId}] S3+S4 Script & Gate 1...`);
      const s34 = await runScriptAndQcStage(projectId, REPO);
      const s4Errs = [...s34.l2Final.issues, ...s34.l0bFinal.report.issues, ...s34.l3Final.issues].filter(
        (i) => i.severity === 'error'
      );
      if (s4Errs.length > 0) {
        throw new Error(`[${projectId}] Gate 1 failed: ${s4Errs.map((e) => e.message).join('; ')}`);
      }

      console.log(`[${projectId}] S5 Voice & Tighten...`);
      await runVoiceStage(projectId, { repoRoot: REPO });
      await tightenExistingVoiceStage(projectId, REPO);
    }

    if (!process.argv.includes('--resume-from-s8') && !process.argv.includes('--reverify-s9')) {
      console.log(`[${projectId}] S6+S7 Storyboard & QC...`);
      await runStoryboardStage(projectId, REPO, { tracker });
      const sbQc = await runStoryboardQcStage(projectId, REPO, { tracker });
      const sbErrs = sbQc.report.issues.filter((i) => i.severity === 'error');
      if (sbErrs.length > 0) {
        throw new Error(`[${projectId}] S7 Storyboard QC failed: ${sbErrs.map((e) => e.message).join('; ')}`);
      }
    }

    if (process.argv.includes('--reverify-s9')) {
      console.log(`[${projectId}] Re-verifying S9 Visual QC (0 Gemini calls)...`);
      clearRemotionBundleCache();
      const sbLocal = StoryboardSchema.parse(JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8')));
      const tlLocal = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
      const ledLocal = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
      const summaryPath = path.join(projectDir, 'scenes', 'summary.json');
      const records = JSON.parse(await readFile(summaryPath, 'utf-8')) as Array<{ sceneId: string; fixes: number; passed: boolean; kitFault: boolean; errors: string[]; lineCount: number }>;
      for (const sc of sbLocal.scenes) {
        if (!['S1', 'S3'].includes(sc.id)) continue;
        const compId = `gen-${projectId}-${sc.id}`;
        const triggerRelSec = findTriggerTimeInScene(sc.id, sc.trigger_words, tlLocal);
        const spec = buildVisualSpecForScene(compId, sc, triggerRelSec, ledLocal);
        const hudData = sc.hud.map((h, idx) => ({ ...h, hud_id: h.hud_id ?? `${sc.id}_H${idx + 1}` }));
        const qc = await runVisualQc({
          spec,
          outputDir: path.join(projectDir, 'qc', sc.id),
          videoOutPath: path.join(projectDir, 'qc', sc.id, `_tmp_${sc.id}.mp4`),
          inputProps: { telemetry: true, hudData },
          repoRoot: REPO,
        });
        const rec = records.find((r) => r.sceneId === sc.id);
        if (rec) {
          rec.passed = qc.passed;
          rec.errors = Object.entries(qc.reports).flatMap(([layer, rep]) =>
            rep.issues.filter((i) => i.severity === 'error').map((i) => `[${layer}] ${i.ref ?? ''}: ${i.message}`)
          );
        }
        if (!qc.passed) throw new Error(`Re-verify S9 ${sc.id} failed: ${rec?.errors.join('; ')}`);
      }
      await writeFile(summaryPath, JSON.stringify(records, null, 2), 'utf-8');
    } else {
      console.log(`[${projectId}] S8+S9 Scenes (profil hemat)...`);
      await runScenesStage(projectId, REPO, { tracker });
    }

    console.log(`[${projectId}] S10 Mix...`);
    await runMixStage(projectId, REPO);

    console.log(`[${projectId}] S11 Final Render (profil hemat)...`);
    const renderRes = await runFinalRenderStage(projectId, { profile: 'hemat', repoRoot: REPO });
    renderMs = renderRes.renderMs;

    console.log(`[${projectId}] S12 Final QC...`);
    finalQc = await runFinalQcStage(projectId, { repoRoot: REPO, videoPath: renderRes.finalPath });
  }
  if (!finalQc.passed) {
    throw new Error(
      `[${projectId}] S12 Final QC FAILED: ${finalQc.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; ')}`
    );
  }

  await generatePublishMarkdown(projectId, REPO);

  // Copy evidence files
  for (const f of ['final.mp4', 'final-qc.md', 'final-qc.json', 'captions.srt', 'publish.md', 'script.json', 'storyboard.json', 'fact-ledger.json']) {
    await copyFile(path.join(projectDir, f), path.join(outProj, f));
  }

  // Extract stills per scene
  const tl = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
  for (const sc of tl.scenes) {
    const mid = ((sc.start + sc.end) / 2).toFixed(2);
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-ss',
      mid,
      '-i',
      path.join(outProj, 'final.mp4'),
      '-frames:v',
      '1',
      path.join(outProj, 'stills', `${sc.scene_id}-mid.png`),
    ]);
  }

  // coverage.md (kalimat khusus per langkah)
  const selAfter = JSON.parse(await readFile(path.join(projectDir, 'selected-concept.json'), 'utf-8')) as {
    concept: { key_steps?: string[] };
  };
  const afterScript = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
  const afterLedger = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const cov = checkKeyStepsCoverage(selAfter.concept.key_steps, afterScript, afterLedger);
  await writeFile(
    path.join(outProj, 'coverage.md'),
    `# Cakupan Langkah Khusus — ${projectId}\n\n| Langkah | Terpenuhi | Kalimat Khusus | Claim Refs |\n|---|---|---|---|\n${cov.rows
      .map((r) => `| ${r.step} | ${r.covered ? 'YA' : 'TIDAK'} | ${r.sentenceRef ? `[${r.sentenceRef}] ${r.sentenceText}` : '-'} | ${r.claimRefs.join(', ') || '-'} |`)
      .join('\n')}\n`,
    'utf-8'
  );

  // arrows.md (per frame, semua panah)
  const sb = StoryboardSchema.parse(JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8')));
  const arrowRows: string[] = [];
  for (const sc of sb.scenes) {
    const samples = JSON.parse(
      await readFile(
        path.join(projectDir, 'qc', sc.id, `gen-${projectId}-${sc.id}-telemetry.json`),
        'utf-8'
      ).catch(() => '[]')
    ) as TelemetrySample[];
    const res = analyzeArrowDirectionFromTelemetry(samples);
    for (const sum of res.summaries) {
      arrowRows.push(
        `| ${sc.id} | ${sum.arrowId} | ${sum.bindPart} | ${sum.bound ? 'YA' : 'TIDAK'} | ${sum.matchedFrames}/${sum.activeFrames} (${(sum.matchRatio * 100).toFixed(1)}%) | ${sum.matched ? 'YA' : 'TIDAK'} |`
      );
    }
  }
  await writeFile(
    path.join(outProj, 'arrows.md'),
    `# Verifikasi Panah Per Frame — ${projectId}\n\n| Adegan | Arrow ID | Bind Part | Terikat | Frame Cocok (>=95%) | Cocok |\n|---|---|---|---|---|---|\n${
      arrowRows.length > 0 ? arrowRows.join('\n') : '| - | - | - | - | - | Tidak ada panah |'
    }\n`,
    'utf-8'
  );

  // onscreen-text.md
  const hudRows: string[] = [];
  for (const sc of sb.scenes) {
    for (const h of sc.hud) {
      hudRows.push(`| ${sc.id} | ${h.hud_id ?? '-'} | ${h.component} | ${JSON.stringify(h.props)} |`);
    }
  }
  await writeFile(
    path.join(outProj, 'onscreen-text.md'),
    `# Teks Layar (HUD) — ${projectId}\n\n| Adegan | HUD ID | Komponen | Props |\n|---|---|---|---|\n${hudRows.join('\n')}\n`,
    'utf-8'
  );

  // stats.md (per fase)
  const p4fStats = await aggregateLlmCallStats(projectDir, phaseStartIso);
  const cumStats = await aggregateLlmCallStats(projectDir);
  const timingLine = formatRenderTiming(renderMs, 0, 0);
  await writeFile(
    path.join(OUT_DIR, 'stats.md'),
    `# P4F Gemini Call & Render Stats\n\n- **${projectId} (P4F phase):** **${p4fStats.totalCalls} calls** across ${p4fStats.totalRuns} run(s) (max **${p4fStats.maxCallsPerRun} calls/run**, cumulative project total: ${cumStats.totalCalls}, ${timingLine})\n- **By Stage (P4F):** ${Object.entries(p4fStats.callsByStage).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}\n`,
    'utf-8'
  );

  console.log(`[${projectId}] DONE! P4F Gemini calls=${p4fStats.totalCalls}, max/run=${p4fStats.maxCallsPerRun}`);
}

async function main() {
  const phaseStartIso = '2026-11-22T04:25:00.000Z';
  await mkdir(OUT_DIR, { recursive: true });
  await runMesinP4F(phaseStartIso);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
