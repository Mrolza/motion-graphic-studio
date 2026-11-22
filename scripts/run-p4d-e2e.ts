import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { DeviceProfileName } from '@core/contracts/project';
import type { Script } from '@core/contracts/script';
import { runFinalQcStage } from '@core/qc/final';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { StoryboardSchema } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { checkQuotaBeforeRun, RunLlmTracker } from '@core/llm/budget';
import { aggregateLlmCallStats, formatRenderTiming } from '@core/llm/stats';
import { getProjectDir, loadProject, resetProjectLastRunCalls } from '@core/project/store';
import { runAllMutations } from './run-p4d-mutations';
import { runFinalRenderStage } from '@core/stages/final-render';
import { runMixStage } from '@core/stages/mix';
import { generatePublishMarkdown, validatePublishSources } from '@core/stages/publish';
import { runResearchStage } from '@core/stages/research';
import { runScenesStage } from '@core/stages/scene-coder';
import { runScriptAndQcStage } from '@core/stages/script';
import { runStoryboardStage } from '@core/stages/storyboard';
import { runVoiceStage, tightenExistingVoiceStage } from '@core/stages/voice';

const execFileAsync = promisify(execFile);
const REPO = process.cwd();
const OUT_DIR = path.join(REPO, 'out', 'review', 'p4d');

function buildLedgerDiffMd(projectId: string, before: FactLedger, after: FactLedger): string {
  const lines = [`# Fact Ledger Diff — ${projectId}`, '', '## Sebelum (P4)', ''];
  for (const c of before.claims) {
    lines.push(`- **${c.id}** (${c.status}): ${c.text}`);
  }
  lines.push('', '## Sesudah (P4D)', '');
  for (const c of after.claims) {
    lines.push(`- **${c.id}** (${c.status}): ${c.text}`);
  }
  return lines.join('\n') + '\n';
}

function buildScriptDiffMd(projectId: string, before: Script, after: Script): string {
  const lines = [`# Script Diff — ${projectId}`, '', '## Sebelum (P4)', ''];
  for (const s of before.scenes) {
    for (const st of s.sentences) {
      lines.push(`- **${s.id}**: ${st.text} [${st.claim_refs.join(', ')}]`);
    }
  }
  lines.push('', '## Sesudah (P4D)', '');
  for (const s of after.scenes) {
    for (const st of s.sentences) {
      lines.push(`- **${s.id}**: ${st.text} [${st.claim_refs.join(', ')}]`);
    }
  }
  return lines.join('\n') + '\n';
}

async function runProjectP4D(projectId: string, profile: DeviceProfileName) {
  console.log(`\n=== P4D E2E (${profile}) for ${projectId} ===`);
  const projectDir = getProjectDir(projectId, REPO);
  const outProj = path.join(OUT_DIR, projectId);
  await mkdir(path.join(outProj, 'stills'), { recursive: true });

  const ledgerBeforePath = path.join(outProj, 'ledger-before.json');
  const scriptBeforePath = path.join(outProj, 'script-before.json');
  const beforeLedgerRaw = await readFile(ledgerBeforePath, 'utf-8').catch(async () => {
    const raw = await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8');
    await writeFile(ledgerBeforePath, raw, 'utf-8');
    return raw;
  });
  const beforeScriptRaw = await readFile(scriptBeforePath, 'utf-8').catch(async () => {
    const raw = await readFile(path.join(projectDir, 'script.json'), 'utf-8');
    await writeFile(scriptBeforePath, raw, 'utf-8');
    return raw;
  });
  const beforeLedger = JSON.parse(beforeLedgerRaw) as FactLedger;
  const beforeScript = JSON.parse(beforeScriptRaw) as Script;

  await resetProjectLastRunCalls(projectId, undefined, REPO);
  const tracker = new RunLlmTracker({ projectDir, limit: 20 });

  const skipS2S5 =
    (projectId === 'p2-kereta' && process.argv.includes('--skip-kereta-s2-s5')) ||
    (projectId === 'p2-mesin4tak' && process.argv.includes('--skip-mesin-s2-s5'));
  if (!skipS2S5) {
    // S2 -> S3 -> S4 (Gate 1) via pipeline
    console.log(`[${projectId}] Running S2 (research)...`);
    await runResearchStage(projectId, { repoRoot: REPO });
    console.log(`[${projectId}] Running S3+S4 (script + Gate 1)...`);
    const s34 = await runScriptAndQcStage(projectId, REPO);
    const s4Errors = [
      ...s34.l2Final.issues,
      ...s34.l0bFinal.report.issues,
      ...s34.l3Final.issues,
    ].filter((i) => i.severity === 'error');
    if (s4Errors.length > 0) {
      throw new Error(`[${projectId}] Gate 1 failed: ${s4Errors.map((e) => e.message).join('; ')}`);
    }

    const afterLedger = JSON.parse(
      await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')
    ) as FactLedger;
    const afterScript = JSON.parse(
      await readFile(path.join(projectDir, 'script.json'), 'utf-8')
    ) as Script;
    await writeFile(
      path.join(outProj, 'ledger-diff.md'),
      buildLedgerDiffMd(projectId, beforeLedger, afterLedger),
      'utf-8'
    );
    await writeFile(
      path.join(outProj, 'script-diff.md'),
      buildScriptDiffMd(projectId, beforeScript, afterScript),
      'utf-8'
    );

    // S5: TTS + VO tighten
    console.log(`[${projectId}] Running S5 (voice + tighten)...`);
    await runVoiceStage(projectId, { repoRoot: REPO });
    await tightenExistingVoiceStage(projectId, REPO);
  }
  const afterLedger = JSON.parse(
    await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;
  const timeline = JSON.parse(
    await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')
  ) as Timeline;

  // S6: Storyboard
  const tS6 = Date.now();
  await runStoryboardStage(projectId, REPO, { tracker });
  const s6Ms = Date.now() - tS6;

  // S7: Storyboard QC + L5 semantic
  const tS7 = Date.now();
  const sbQc = await runStoryboardQcStage(projectId, REPO, { tracker });
  const s7Ms = Date.now() - tS7;
  if (sbQc.report.issues.some((i) => i.severity === 'error')) {
    throw new Error(
      `[${projectId}] S7 failed: ${sbQc.report.issues.map((i) => i.message).join('; ')}`
    );
  }

  // S8/S9: Scene Coder + Visual QC
  const tS8 = Date.now();
  const scenesRes = await runScenesStage(projectId, REPO, {
    tracker,
  });
  const s8Ms = Date.now() - tS8;
  if (!scenesRes.every((r) => r.passed)) {
    throw new Error(
      `[${projectId}] S8/S9 failed: ${scenesRes
        .filter((r) => !r.passed)
        .map((r) => `${r.sceneId}: ${r.errors.join(', ')}`)
        .join(' | ')}`
    );
  }

  // S10: Mix + Final Render
  const mixRes = await runMixStage(projectId, REPO);
  const renderRes = await runFinalRenderStage(projectId, { profile, repoRoot: REPO });

  // S11/S12: Final QC
  const finalQc = await runFinalQcStage(projectId, { repoRoot: REPO });
  if (!finalQc.passed) {
    throw new Error(
      `[${projectId}] Final QC FAILED: ${finalQc.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; ')}`
    );
  }

  // Publish.md
  const proj = await loadProject(projectId, REPO);
  const pubMd = await generatePublishMarkdown(projectId, proj.topic, REPO);
  const pubCheck = validatePublishSources(pubMd, afterLedger);
  if (!pubCheck.ok) {
    throw new Error(`[${projectId}] Publish URL check failed: ${pubCheck.unknownUrls.join(', ')}`);
  }

  // Copy evidence to out/review/p4d/<projectId>/
  for (const fname of [
    'final.mp4',
    'final-qc.json',
    'final-qc.md',
    'overlap-scan.md',
    'onscreen-text.md',
    'captions.srt',
    'publish.md',
    'storyboard.json',
    'fact-ledger.json',
    'script.json',
    'timeline-gaps.md',
    'llm-calls.jsonl',
  ]) {
    await copyFile(path.join(projectDir, fname), path.join(outProj, fname)).catch(() => {});
  }
  await copyFile(path.join(projectDir, 'audio', 'loudness.txt'), path.join(outProj, 'loudness.txt'));

  // Contact sheet & 1 still per scene from final.mp4
  await execFileAsync(ffmpegInstaller.path, [
    '-y',
    '-v',
    'error',
    '-i',
    renderRes.finalPath,
    '-vf',
    'fps=2,scale=240:-1,tile=6x14',
    '-frames:v',
    '1',
    path.join(outProj, 'contact-sheet.png'),
  ]);
  for (const ts of timeline.scenes) {
    const mid = (ts.start + ts.end) / 2;
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-ss',
      mid.toFixed(2),
      '-i',
      renderRes.finalPath,
      '-frames:v',
      '1',
      path.join(outProj, 'stills', `${ts.scene_id}-mid.png`),
    ]);
  }

  const llmStats = await aggregateLlmCallStats(projectDir);
  return { proj, sbQc, renderRes, mixRes, finalQc, llmStats, s6Ms, s7Ms, s8Ms };
}

async function main() {
  if (process.argv.includes('--mutations-only')) {
    await runAllMutations(REPO, OUT_DIR);
    console.log('Mutations updated!');
    return;
  }
  await checkQuotaBeforeRun({ estimatedCalls: 10, repoRoot: REPO });
  const skipKereta = process.argv.includes('--skip-kereta');
  const skipMesin = process.argv.includes('--skip-mesin');
  const rMesin = skipMesin
    ? {
        finalQc: JSON.parse(
          await readFile(path.join(OUT_DIR, 'p2-mesin4tak', 'final-qc.json'), 'utf-8')
        ) as Awaited<ReturnType<typeof runFinalQcStage>>,
        llmStats: await aggregateLlmCallStats(getProjectDir('p2-mesin4tak', REPO)),
        renderRes: { renderMs: 0, chunksSkipped: 1, chunksCount: 1 },
        s6Ms: 0,
        s7Ms: 0,
        s8Ms: 0,
      }
    : await runProjectP4D('p2-mesin4tak', 'hemat');
  const rKereta = skipKereta
    ? {
        finalQc: JSON.parse(
          await readFile(path.join(OUT_DIR, 'p2-kereta', 'final-qc.json'), 'utf-8')
        ) as Awaited<ReturnType<typeof runFinalQcStage>>,
        llmStats: await aggregateLlmCallStats(getProjectDir('p2-kereta', REPO)),
        renderRes: { renderMs: 0, chunksSkipped: 1, chunksCount: 1 },
        s6Ms: 0,
        s7Ms: 0,
        s8Ms: 0,
      }
    : await runProjectP4D('p2-kereta', 'standar');
  await runAllMutations(REPO, OUT_DIR);

  const statsLines = [
    '# P4D E2E Stats & LLM Call Telemetry',
    '',
    '## p2-kereta (standar)',
    `- Total panggilan Gemini (kumulatif llm-calls.jsonl): **${rKereta.llmStats.totalCalls}** across **${rKereta.llmStats.totalRuns}** runs (max **${rKereta.llmStats.maxCallsPerRun}** calls/run)`,
    `- Per tahap: ${JSON.stringify(rKereta.llmStats.callsByStage)}`,
    `- Render timing: ${formatRenderTiming(rKereta.renderRes.renderMs, rKereta.renderRes.chunksSkipped, rKereta.renderRes.chunksCount)}`,
    `- S6: ${rKereta.s6Ms} ms | S7: ${rKereta.s7Ms} ms | S8: ${rKereta.s8Ms} ms`,
    `- Final QC: ${rKereta.finalQc.passed ? 'PASS' : 'FAIL'} (${rKereta.finalQc.technical.pixFmt}, ${rKereta.finalQc.technical.width}x${rKereta.finalQc.technical.height})`,
    '',
    '## p2-mesin4tak (hemat)',
    `- Total panggilan Gemini (kumulatif llm-calls.jsonl): **${rMesin.llmStats.totalCalls}** across **${rMesin.llmStats.totalRuns}** runs (max **${rMesin.llmStats.maxCallsPerRun}** calls/run)`,
    `- Per tahap: ${JSON.stringify(rMesin.llmStats.callsByStage)}`,
    `- Render timing: ${formatRenderTiming(rMesin.renderRes.renderMs, rMesin.renderRes.chunksSkipped, rMesin.renderRes.chunksCount)}`,
    `- S6: ${rMesin.s6Ms} ms | S7: ${rMesin.s7Ms} ms | S8: ${rMesin.s8Ms} ms`,
    `- Final QC: ${rMesin.finalQc.passed ? 'PASS' : 'FAIL'} (${rMesin.finalQc.technical.pixFmt}, ${rMesin.finalQc.technical.width}x${rMesin.finalQc.technical.height})`,
  ];
  await writeFile(path.join(OUT_DIR, 'stats.md'), statsLines.join('\n') + '\n', 'utf-8');
  console.log('\nP4D E2E completed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
