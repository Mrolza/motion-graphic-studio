import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { DeviceProfileName } from '@core/contracts/project';
import type { Script } from '@core/contracts/script';
import type { Timeline } from '@core/contracts/timeline';
import { checkQuotaBeforeRun, RunLlmTracker } from '@core/llm/budget';
import { aggregateLlmCallStats, formatRenderTiming } from '@core/llm/stats';
import { getProjectDir, loadProject, resetProjectLastRunCalls } from '@core/project/store';
import { runFinalQcStage } from '@core/qc/final';
import { checkKeyStepsCoverage } from '@core/qc/l0b-quality';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { analyzeArrowDirectionFromTelemetry } from '@core/qc/visual/arrow-check';
import type { TelemetrySample } from '@core/qc/visual/types';
import { runFinalRenderStage } from '@core/stages/final-render';
import { runMixStage } from '@core/stages/mix';
import { generatePublishMarkdown, validatePublishHedges, validatePublishSources } from '@core/stages/publish';
import { runResearchStage } from '@core/stages/research';
import { runScenesStage } from '@core/stages/scene-coder';
import { runScriptAndQcStage } from '@core/stages/script';
import { runStoryboardStage } from '@core/stages/storyboard';
import { runVoiceStage, tightenExistingVoiceStage } from '@core/stages/voice';
import { runP4EMutations } from './run-p4e-mutations';

const execFileAsync = promisify(execFile);
const REPO = process.cwd();
const OUT_DIR = path.join(REPO, 'out', 'review', 'p4e');

function buildLedgerDiffMd(projectId: string, before: FactLedger, after: FactLedger): string {
  const lines = [`# Fact Ledger Diff — ${projectId}`, '', '## Sebelum (p4d-done)', ''];
  for (const c of before.claims) {
    lines.push(`- **${c.id}** (${c.status}${c.status_reason ? ` — ${c.status_reason}` : ''}): ${c.text}`);
  }
  lines.push('', '## Sesudah (P4E)', '');
  for (const c of after.claims) {
    lines.push(`- **${c.id}** (${c.status}${c.status_reason ? ` — ${c.status_reason}` : ''}): ${c.text}`);
  }
  return lines.join('\n') + '\n';
}

function buildScriptDiffMd(projectId: string, before: Script, after: Script): string {
  const lines = [`# Script Diff — ${projectId}`, '', '## Sebelum (p4d-done)', ''];
  for (const s of before.scenes) {
    for (const st of s.sentences) lines.push(`- **${s.id}**: ${st.text} [${st.claim_refs.join(', ')}]`);
  }
  lines.push('', '## Sesudah (P4E)', '');
  for (const s of after.scenes) {
    for (const st of s.sentences) lines.push(`- **${s.id}**: ${st.text} [${st.claim_refs.join(', ')}]`);
  }
  return lines.join('\n') + '\n';
}

async function runProjectP4E(projectId: string, profile: DeviceProfileName, phaseStartIso: string) {
  console.log(`\n=== P4E E2E (${profile}) for ${projectId} ===`);
  const projectDir = getProjectDir(projectId, REPO);
  const outProj = path.join(OUT_DIR, projectId);
  await mkdir(path.join(outProj, 'stills'), { recursive: true });

  const beforeLedger = JSON.parse(await readFile(path.join(outProj, 'before', 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const beforeScript = JSON.parse(await readFile(path.join(outProj, 'before', 'script.json'), 'utf-8')) as Script;

  if (projectId === 'p2-mesin4tak') {
    const selPath = path.join(projectDir, 'selected-concept.json');
    const sel = JSON.parse(await readFile(selPath, 'utf-8')) as { index: number; concept: { key_steps?: string[] } };
    sel.concept.key_steps = ['Hisap', 'Kompresi', 'Usaha / Tenaga', 'Buang'];
    await writeFile(selPath, JSON.stringify(sel, null, 2), 'utf-8');
  }

  await resetProjectLastRunCalls(projectId, undefined, REPO);
  const tracker = new RunLlmTracker({ projectDir, limit: 20 });

  const skipS2S5 =
    process.argv.includes('--skip-s2-s5') ||
    (projectId === 'p2-mesin4tak' && process.argv.includes('--skip-mesin-s2-s5'));
  if (!skipS2S5) {
    if (!(projectId === 'p2-mesin4tak' && process.argv.includes('--skip-mesin-s2'))) {
      console.log(`[${projectId}] S2 Research...`);
      await runResearchStage(projectId, { repoRoot: REPO });
    }
    console.log(`[${projectId}] S3+S4 Script & Gate 1...`);
    const s34 = await runScriptAndQcStage(projectId, REPO);
    const s4Errs = [...s34.l2Final.issues, ...s34.l0bFinal.report.issues, ...s34.l3Final.issues].filter((i) => i.severity === 'error');
    if (s4Errs.length > 0) throw new Error(`[${projectId}] Gate 1 failed: ${s4Errs.map((e) => e.message).join('; ')}`);

    console.log(`[${projectId}] S5 Voice & Tighten...`);
    await runVoiceStage(projectId, { repoRoot: REPO });
    await tightenExistingVoiceStage(projectId, REPO);
  }

  const afterLedger = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const afterScript = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
  const timeline = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
  const selConcept = JSON.parse(await readFile(path.join(projectDir, 'selected-concept.json'), 'utf-8')) as {
    concept: { key_steps?: string[]; core_claims: string[] };
  };

  await writeFile(path.join(outProj, 'ledger-diff.md'), buildLedgerDiffMd(projectId, beforeLedger, afterLedger), 'utf-8');
  await writeFile(path.join(outProj, 'script-diff.md'), buildScriptDiffMd(projectId, beforeScript, afterScript), 'utf-8');

  const steps = selConcept.concept.key_steps ?? selConcept.concept.core_claims;
  const cov = checkKeyStepsCoverage(steps, afterScript, afterLedger);
  const covLines = ['# Coverage — ' + projectId, '', '| Langkah / Klaim | Terpenuhi | Ref Kalimat | Klaim Verified | Kalimat |', '|---|---|---|---|---|'];
  for (const r of cov.rows) {
    covLines.push(`| ${r.step} | ${r.covered ? 'YA' : 'TIDAK'} | ${r.sentenceRef ?? '-'} | ${r.claimRefs.join(', ') || '-'} | ${r.sentenceText ?? '-'} |`);
  }
  await writeFile(path.join(outProj, 'coverage.md'), covLines.join('\n') + '\n', 'utf-8');

  await runStoryboardStage(projectId, REPO, { tracker });
  const sbQc = await runStoryboardQcStage(projectId, REPO, { tracker });
  if (sbQc.report.issues.some((i) => i.severity === 'error')) {
    throw new Error(`[${projectId}] S7 failed: ${sbQc.report.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`);
  }

  const scenesRes = await runScenesStage(projectId, REPO, { tracker });
  if (!scenesRes.every((r) => r.passed)) {
    throw new Error(`[${projectId}] S8/S9 failed: ${scenesRes.filter((r) => !r.passed).map((r) => `${r.sceneId}: ${r.errors.join(', ')}`).join(' | ')}`);
  }

  await runMixStage(projectId, REPO);
  const renderRes = await runFinalRenderStage(projectId, { profile, repoRoot: REPO });
  const finalQc = await runFinalQcStage(projectId, { repoRoot: REPO });
  if (!finalQc.passed) {
    throw new Error(`[${projectId}] Final QC FAILED: ${finalQc.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`);
  }

  const proj = await loadProject(projectId, REPO);
  const pubMd = await generatePublishMarkdown(projectId, proj.topic, REPO);
  const pubUrls = validatePublishSources(pubMd, afterLedger);
  const pubHedges = validatePublishHedges(pubMd, afterLedger, afterScript);
  if (!pubUrls.ok || !pubHedges.ok) {
    throw new Error(`[${projectId}] Publish failed: ${[...pubUrls.unknownUrls, ...pubHedges.errors].join('; ')}`);
  }

  if (projectId === 'p2-mesin4tak') {
    const samples = JSON.parse(await readFile(path.join(projectDir, 'telemetry-samples.json'), 'utf-8').catch(() => '[]')) as TelemetrySample[];
    const arrowLines = ['# Telemetry Arah Panah vs Gerak Piston — p2-mesin4tak', '', '| Adegan | Arrow ID | Part | Avg Dir Y | Piston Delta Y | Cocok |', '|---|---|---|---:|---:|---|'];
    for (const ts of timeline.scenes) {
      const scSamples = samples.filter((s) => s.sec >= ts.start && s.sec <= ts.end);
      const res = analyzeArrowDirectionFromTelemetry(scSamples);
      if (res.summaries.length === 0) {
        arrowLines.push(`| ${ts.scene_id} | (tidak ada panah) | piston | - | - | N/A |`);
      } else {
        for (const a of res.summaries) {
          arrowLines.push(`| ${ts.scene_id} | ${a.arrowId} | ${a.bindPart} | ${a.avgDirY} | ${a.partDeltaY} | ${a.matched ? 'YA' : 'TIDAK'} |`);
        }
      }
    }
    await writeFile(path.join(outProj, 'arrows.md'), arrowLines.join('\n') + '\n', 'utf-8');
  }

  for (const fname of [
    'final.mp4', 'final-qc.json', 'final-qc.md', 'overlap-scan.md',
    'onscreen-text.md', 'captions.srt', 'publish.md', 'storyboard.json',
    'fact-ledger.json', 'script.json', 'timeline-gaps.md', 'llm-calls.jsonl',
  ]) {
    await copyFile(path.join(projectDir, fname), path.join(outProj, fname)).catch(() => {});
  }
  await copyFile(path.join(projectDir, 'audio', 'loudness.txt'), path.join(outProj, 'loudness.txt'));

  await execFileAsync(ffmpegInstaller.path, [
    '-y', '-v', 'error', '-i', renderRes.finalPath,
    '-vf', 'fps=2,scale=240:-1,tile=6x14', '-frames:v', '1',
    path.join(outProj, 'contact-sheet.png'),
  ]);
  for (const ts of timeline.scenes) {
    const mid = (ts.start + ts.end) / 2;
    await execFileAsync(ffmpegInstaller.path, [
      '-y', '-v', 'error', '-ss', mid.toFixed(2), '-i', renderRes.finalPath,
      '-frames:v', '1', path.join(outProj, 'stills', `${ts.scene_id}-mid.png`),
    ]);
  }

  const phaseStats = await aggregateLlmCallStats(projectDir, phaseStartIso);
  const totalStats = await aggregateLlmCallStats(projectDir);
  return { finalQc, renderRes, phaseStats, totalStats };
}

async function main() {
  if (process.argv.includes('--mutations-only')) {
    await runP4EMutations(REPO, OUT_DIR);
    console.log('P4E mutations updated!');
    return;
  }
  await checkQuotaBeforeRun({ estimatedCalls: 25, repoRoot: REPO });
  const phaseStartIso = process.env.P4E_PHASE_START ?? new Date().toISOString();

  const rMesin = process.argv.includes('--skip-mesin')
    ? {
        finalQc: JSON.parse(await readFile(path.join(OUT_DIR, 'p2-mesin4tak', 'final-qc.json'), 'utf-8')) as Awaited<ReturnType<typeof runFinalQcStage>>,
        renderRes: { renderMs: 0, chunksSkipped: 1, chunksCount: 1 },
        phaseStats: await aggregateLlmCallStats(getProjectDir('p2-mesin4tak', REPO), phaseStartIso),
        totalStats: await aggregateLlmCallStats(getProjectDir('p2-mesin4tak', REPO)),
      }
    : await runProjectP4E('p2-mesin4tak', 'hemat', phaseStartIso);
  const rKereta = await runProjectP4E('p2-kereta', 'standar', phaseStartIso);
  await runP4EMutations(REPO, OUT_DIR);

  const statsLines = [
    '# P4E E2E Stats & LLM Call Telemetry',
    '',
    `- Filter awal fase P4E: \`${phaseStartIso}\``,
    '',
    '## p2-mesin4tak (hemat)',
    `- **Total panggilan fase P4E:** **${rMesin.phaseStats.totalCalls}** across **${rMesin.phaseStats.totalRuns}** runs (maks **${rMesin.phaseStats.maxCallsPerRun}** calls/run)`,
    `- Per tahap (P4E): ${JSON.stringify(rMesin.phaseStats.callsByStage)}`,
    `- Kumulatif semua fase (info tambahan): ${rMesin.totalStats.totalCalls} panggilan`,
    `- Render timing: ${formatRenderTiming(rMesin.renderRes.renderMs, rMesin.renderRes.chunksSkipped, rMesin.renderRes.chunksCount)}`,
    `- Final QC: ${rMesin.finalQc.passed ? 'PASS' : 'FAIL'} (${rMesin.finalQc.technical.pixFmt}, ${rMesin.finalQc.technical.width}x${rMesin.finalQc.technical.height})`,
    '',
    '## p2-kereta (standar)',
    `- **Total panggilan fase P4E:** **${rKereta.phaseStats.totalCalls}** across **${rKereta.phaseStats.totalRuns}** runs (maks **${rKereta.phaseStats.maxCallsPerRun}** calls/run)`,
    `- Per tahap (P4E): ${JSON.stringify(rKereta.phaseStats.callsByStage)}`,
    `- Kumulatif semua fase (info tambahan): ${rKereta.totalStats.totalCalls} panggilan`,
    `- Render timing: ${formatRenderTiming(rKereta.renderRes.renderMs, rKereta.renderRes.chunksSkipped, rKereta.renderRes.chunksCount)}`,
    `- Final QC: ${rKereta.finalQc.passed ? 'PASS' : 'FAIL'} (${rKereta.finalQc.technical.pixFmt}, ${rKereta.finalQc.technical.width}x${rKereta.finalQc.technical.height})`,
  ];
  await writeFile(path.join(OUT_DIR, 'stats.md'), statsLines.join('\n') + '\n', 'utf-8');
  console.log('\nP4E E2E completed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
