import { execFile } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { checkQuotaBeforeRun, RunLlmTracker } from '@core/llm/budget';
import { aggregateLlmCallStats } from '@core/llm/stats';
import { getProjectDir, loadProject, resetProjectLastRunCalls, saveProject } from '@core/project/store';
import { editScriptSentences } from '@core/qc/edit-script';
import { runFinalQcStage } from '@core/qc/final';
import { validateGate1Approval } from '@core/qc/gate1-check';
import { checkKeyStepsCoverage } from '@core/qc/l0b-quality';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { runFinalRenderStage } from '@core/stages/final-render';
import { runMixStage } from '@core/stages/mix';
import { generatePublishMarkdown } from '@core/stages/publish';
import { runResearchStage } from '@core/stages/research';
import { runScenesStage } from '@core/stages/scene-coder';
import { runScriptAndQcStage } from '@core/stages/script';
import { runStoryboardStage } from '@core/stages/storyboard';
import { runVoiceStage, tightenExistingVoiceStage } from '@core/stages/voice';
import { formatReviewText } from '../src/cli/gate1';

const execFileAsync = promisify(execFile);
const REPO = process.cwd();
const OUT_DIR = path.join(REPO, 'out', 'review', 'p4g');

async function resetFromS2(projectId: string, projectDir: string) {
  const proj = await loadProject(projectId, REPO);
  proj.device_profile = 'hemat';
  for (const k of Object.keys(proj.stages) as Array<keyof typeof proj.stages>) {
    proj.stages[k] = k === 'S1' ? 'done' : 'pending';
  }
  await saveProject(proj, REPO);
  for (const rel of [
    'storyboard.meta.json',
    'scenes/cache.json',
    'qc/storyboard-review.meta.json',
    'qc/l5-semantic.meta.json',
    'edits.jsonl',
  ]) {
    await rm(path.join(projectDir, rel), { force: true }).catch(() => {});
  }
  await rm(path.join(projectDir, 'audio', 'sentences'), { recursive: true, force: true }).catch(() => {});
}

async function main() {
  const phaseStartIso = new Date().toISOString();
  const projectId = 'p2-mesin4tak';
  const projectDir = getProjectDir(projectId, REPO);
  await mkdir(path.join(OUT_DIR, 'stills'), { recursive: true });
  await mkdir(path.join(OUT_DIR, 'edit-demo'), { recursive: true });

  await checkQuotaBeforeRun({ estimatedCalls: 25, rpdLimit: 1000, repoRoot: REPO });
  await resetProjectLastRunCalls(projectId, undefined, REPO);
  const tracker = new RunLlmTracker({ projectDir, limit: 20 });

  await resetFromS2(projectId, projectDir);

  console.log(`[${projectId}] S2 Research (Part A)...`);
  await runResearchStage(projectId, { repoRoot: REPO });

  console.log(`[${projectId}] S3+S4 Script & Gate 1 (Part B)...`);
  const s34 = await runScriptAndQcStage(projectId, REPO);
  const s4Errs = [...s34.l2Final.issues, ...s34.l0bFinal.report.issues, ...s34.l3Final.issues].filter(
    (i) => i.severity === 'error'
  );
  if (s4Errs.length > 0) {
    throw new Error(`[${projectId}] Gate 1 failed: ${s4Errs.map((e) => e.message).join('; ')}`);
  }
  const gate1 = await validateGate1Approval(projectDir);
  if (!gate1.approved) {
    throw new Error(`[${projectId}] Gate 1 approval rejected: ${gate1.reasons.join('; ')}`);
  }

  console.log(`[${projectId}] S5 Voice & Tighten...`);
  await runVoiceStage(projectId, { repoRoot: REPO });
  await tightenExistingVoiceStage(projectId, REPO);

  console.log(`[${projectId}] S6+S7 Storyboard & QC...`);
  await runStoryboardStage(projectId, REPO, { tracker });
  const sbQc = await runStoryboardQcStage(projectId, REPO, { tracker });
  const sbErrs = sbQc.report.issues.filter((i) => i.severity === 'error');
  if (sbErrs.length > 0) {
    throw new Error(`[${projectId}] S7 Storyboard QC failed: ${sbErrs.map((e) => e.message).join('; ')}`);
  }

  console.log(`[${projectId}] S8+S9 Scenes (profil hemat)...`);
  await runScenesStage(projectId, REPO, { tracker });

  console.log(`[${projectId}] S10 Mix...`);
  await runMixStage(projectId, REPO);

  console.log(`[${projectId}] S11 Final Render (profil hemat)...`);
  const renderRes = await runFinalRenderStage(projectId, { profile: 'hemat', repoRoot: REPO });

  console.log(`[${projectId}] S12 Final QC...`);
  const finalQc = await runFinalQcStage(projectId, { repoRoot: REPO, videoPath: renderRes.finalPath });
  if (!finalQc.passed) {
    throw new Error(
      `[${projectId}] S12 Final QC FAILED: ${finalQc.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; ')}`
    );
  }
  await generatePublishMarkdown(projectId, REPO);

  // Copy evidence files for p2-mesin4tak
  for (const [src, dst] of [
    ['final.mp4', 'final.mp4'],
    ['final-qc.md', 'final-qc.md'],
    ['quote-selection.md', 'quote-selection.md'],
    ['publish.md', 'publish.md'],
  ] as const) {
    await copyFile(path.join(projectDir, src), path.join(OUT_DIR, dst));
  }

  // Generate script.md (naskah lengkap per kalimat dengan klaim dan kutipan)
  await writeFile(path.join(OUT_DIR, 'script.md'), await formatReviewText(projectId, REPO), 'utf-8');

  // Generate coverage.md
  const ledger = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const script = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
  const sel = JSON.parse(await readFile(path.join(projectDir, 'selected-concept.json'), 'utf-8')) as {
    concept: { key_steps?: string[] };
  };
  const cov = checkKeyStepsCoverage(sel.concept.key_steps, script, ledger);
  const covRows = cov.rows.map(
    (r) => `| ${r.step} | ${r.covered ? 'YA' : 'TIDAK'} | ${r.sentenceRef ?? '-'} | ${r.claimRefs.join(', ') || '-'} | ${r.sentenceText ?? '-'} |`
  );
  await writeFile(
    path.join(OUT_DIR, 'coverage.md'),
    `# Cakupan Langkah Proses (${projectId})\n\n| Langkah | Terjelaskan | Kalimat | Klaim | Teks |\n|---|---|---|---|---|\n${covRows.join('\n')}\n`,
    'utf-8'
  );

  // Generate onscreen-text.md
  const sb = StoryboardSchema.parse(JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8')));
  const hudLines = sb.scenes.map(
    (sc) => `## ${sc.id} (${sc.shot_type})\n${sc.hud.map((h) => `- **${h.component}**: ${JSON.stringify(h.props)}`).join('\n')}`
  );
  await writeFile(path.join(OUT_DIR, 'onscreen-text.md'), `# Teks Layar (${projectId})\n\n${hudLines.join('\n\n')}\n`, 'utf-8');

  // Extract stills per scene
  const tl = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
  for (const sc of tl.scenes) {
    const midSec = Number(((sc.start + sc.end) / 2).toFixed(2));
    await execFileAsync(ffmpegInstaller.path, [
      '-y', '-v', 'error', '-ss', String(midSec), '-i', renderRes.finalPath,
      '-frames:v', '1', path.join(OUT_DIR, 'stills', `${sc.scene_id}-mid.png`),
    ]);
  }

  // Part C Demo on a copy: p2-mesin4tak-edit-demo
  const demoId = 'p2-mesin4tak-edit-demo';
  const demoDir = getProjectDir(demoId, REPO);
  await rm(demoDir, { recursive: true, force: true }).catch(() => {});
  await cp(projectDir, demoDir, { recursive: true });
  const demoProj = JSON.parse(await readFile(path.join(demoDir, 'project.json'), 'utf-8'));
  demoProj.id = demoId;
  await writeFile(path.join(demoDir, 'project.json'), JSON.stringify(demoProj, null, 2), 'utf-8');

  await writeFile(path.join(OUT_DIR, 'edit-demo', 'review-before.txt'), await formatReviewText(demoId, REPO), 'utf-8');
  const manBefore = JSON.parse(
    await readFile(path.join(demoDir, 'audio', 'sentences', 'manifest.json'), 'utf-8')
  ) as Record<string, { audio_sha256: string; duration_sec: number }>;

  // Pick a non-factual sentence or safe sentence to edit cleanly (preserving claims/hedges)
  const targetSent = script.scenes[0]!.sentences[0]!;
  const demoEditText = `${targetSent.text.replace(/\.+$/, '')} secara berurutan.`;
  console.log(`[${demoId}] Demonstrating mgs edit on S1.1...`);
  const editRes = await editScriptSentences({
    projectId: demoId,
    edits: [{ ref: 'S1.1', text: demoEditText }],
    repoRoot: REPO,
  });
  if (editRes.hasErrors) {
    throw new Error(`[${demoId}] Edit demo had QC errors: ${JSON.stringify([editRes.l2Report.issues, editRes.l0bIssues, editRes.l3Report.issues])}`);
  }
  const demoGate = await validateGate1Approval(demoDir);
  if (!demoGate.approved) {
    throw new Error(`[${demoId}] Gate 1 approve failed: ${demoGate.reasons.join('; ')}`);
  }
  const demoProjAfterApprove = await loadProject(demoId, REPO);
  demoProjAfterApprove.stages.S4 = 'done';
  await saveProject(demoProjAfterApprove, REPO);

  const voiceAfter = await runVoiceStage(demoId, { repoRoot: REPO, skipTighten: true });
  const manAfter = JSON.parse(
    await readFile(path.join(demoDir, 'audio', 'sentences', 'manifest.json'), 'utf-8')
  ) as Record<string, { audio_sha256: string; duration_sec: number }>;

  await writeFile(path.join(OUT_DIR, 'edit-demo', 'review-after.txt'), await formatReviewText(demoId, REPO), 'utf-8');
  await copyFile(path.join(demoDir, 'edits.jsonl'), path.join(OUT_DIR, 'edit-demo', 'edits.jsonl'));

  const hashRows = Object.keys(manBefore).map((ref) => {
    const b = manBefore[ref]!.audio_sha256.slice(0, 16);
    const a = manAfter[ref]?.audio_sha256.slice(0, 16) ?? '-';
    const status = b === a ? 'UNCHANGED (cached)' : 'RE-SYNTHESIZED';
    return `| ${ref} | \`${b}\` | \`${a}\` | ${status} |`;
  });
  await writeFile(
    path.join(OUT_DIR, 'edit-demo', 'audio-hashes.md'),
    `# Hash Audio Per Kalimat (${demoId})\n\n- Kalimat disunting: \`S1.1\`\n- Kalimat reused: \`${voiceAfter.reusedSentenceRefs.join(', ')}\`\n- Kalimat disintesis ulang: \`${voiceAfter.synthesizedSentenceRefs.join(', ')}\`\n\n| Ref | Hash Sebelum | Hash Sesudah | Status |\n|---|---|---|---|\n${hashRows.join('\n')}\n`,
    'utf-8'
  );

  // Write stats.md (per fase)
  const phaseStats = await aggregateLlmCallStats(projectDir, phaseStartIso);
  const totalStats = await aggregateLlmCallStats(projectDir);
  const stageRows = Object.entries(phaseStats.callsByStage).map(([st, cnt]) => `| ${st} | ${cnt} |`);
  const statsMd = `# Statistik Panggilan Gemini — Fase P4G\n\n- **Total panggilan fase P4G (${projectId}):** ${phaseStats.totalCalls} (batas ≤ 30)\n- **Maksimum per run:** ${phaseStats.maxCallsPerRun} (batas ≤ 20)\n- **Demo suntingan (${demoId}):** 1 panggilan L3\n- **Total kumulatif proyek:** ${totalStats.totalCalls}\n- **Durasi render final (${projectId}):** ${(renderRes.renderMs / 1000).toFixed(1)}s (profil hemat)\n\n| Tahap | Panggilan P4G |\n|---|---:|\n${stageRows.join('\n')}\n`;
  await writeFile(path.join(OUT_DIR, 'stats.md'), statsMd, 'utf-8');
  console.log(`P4G E2E COMPLETE! Phase Gemini calls: ${phaseStats.totalCalls} (+1 edit demo)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
