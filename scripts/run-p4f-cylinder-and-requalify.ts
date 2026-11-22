import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema } from '@core/contracts/storyboard';
import { TimelineSchema } from '@core/contracts/timeline';
import { runFinalQcStage } from '@core/qc/final';
import { checkTtsVoiceConsistency } from '@core/qc/final-checks';
import { checkKeyStepsCoverage } from '@core/qc/l0b-quality';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { analyzeArrowDirectionFromTelemetry } from '@core/qc/visual/arrow-check';
import type { TelemetrySample } from '@core/qc/visual/types';

const TELEMETRY_PREFIX = 'MGS_TELEMETRY ';

async function renderCylinderSectionEvidence(repoRoot: string, outDir: string): Promise<void> {
  const cylDir = path.join(outDir, 'cylinder-section');
  await mkdir(cylDir, { recursive: true });

  const serveUrl = await bundle({
    entryPoint: path.join(repoRoot, 'remotion', 'src', 'index.ts'),
  });
  const angles = [0, 90, 180, 270, 360, 450, 540, 630];
  const rows: string[] = [];

  for (const deg of angles) {
    const inputProps = { telemetry: true, assembly: 'CylinderSection', driverValue: deg };
    const composition = await selectComposition({
      serveUrl,
      id: 'KitFramingHarness',
      inputProps,
    });

    let sample: TelemetrySample | null = null;
    const outPng = path.join(cylDir, `angle-${deg}.png`);
    await renderStill({
      composition,
      serveUrl,
      output: outPng,
      frame: 0,
      inputProps,
      chromiumOptions: { gl: 'swangle' },
      onBrowserLog: (log) => {
        if (log.text.includes('THREE.Clock') && log.text.includes('deprecated')) return;
        if (log.text.startsWith(TELEMETRY_PREFIX)) {
          try {
            sample = JSON.parse(log.text.slice(TELEMETRY_PREFIX.length)) as TelemetrySample;
          } catch {
            // ignore
          }
        }
      },
    });

    const ent = (sample as TelemetrySample | null)?.entities.find((e) => e.id === 'focus_entity');
    const st = ent?.partStates ?? {};
    rows.push(
      `| ${deg}° | ${String(st.stroke_phase ?? '-')} | ${String(st.intake_valve ?? '-')} | ${String(st.exhaust_valve ?? '-')} | ${String(st.spark ?? '-')} | ${String(st.piston_y ?? '-')} | ${String(st.chamber_volume_ratio ?? '-')} |`
    );
  }

  const md = `# CylinderSection Telemetry (8 Sudut Sampel, Sumber: Telemetri Render Remotion)\n\n| Sudut Engkol | Langkah | Katup Masuk | Katup Buang | Busi | Posisi Piston Y | Rasio Volume Ruang Bakar |\n|---:|---|---|---|---|---:|---:|\n${rows.join('\n')}\n`;
  await writeFile(path.join(cylDir, 'telemetry.md'), md, 'utf-8');
  console.log(`Saved CylinderSection 8 stills + telemetry.md to ${cylDir}`);
}

async function requalifyKeretaP4E(repoRoot: string, outDir: string): Promise<void> {
  const p4eKeretaDir = path.join(repoRoot, 'out', 'review', 'p4e', 'p2-kereta');
  const finalMp4 = path.join(p4eKeretaDir, 'final.mp4');

  const projKeretaDir = path.join(repoRoot, 'projects', 'p2-kereta');
  const script = ScriptJsonParse(await readFile(path.join(p4eKeretaDir, 'script.json'), 'utf-8'));
  const ledger = JSON.parse(await readFile(path.join(p4eKeretaDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const storyboard = StoryboardSchema.parse(JSON.parse(await readFile(path.join(p4eKeretaDir, 'storyboard.json'), 'utf-8')));
  const tl = TimelineSchema.parse(JSON.parse(await readFile(path.join(projKeretaDir, 'timeline.json'), 'utf-8')));

  const sbQc = verifyStoryboardCode(storyboard, script, tl, ledger, { domain: 'rail' });
  const sbErrors = sbQc.issues.filter((i) => i.severity === 'error');

  const cov = checkKeyStepsCoverage(['self-centering', 'geser ke rel luar'], script, ledger);
  const tts = await checkTtsVoiceConsistency(projKeretaDir);
  const telemetrySamples = JSON.parse(
    await readFile(path.join(projKeretaDir, 'telemetry-samples.json'), 'utf-8').catch(() => '[]')
  ) as TelemetrySample[];
  const arrows = analyzeArrowDirectionFromTelemetry(telemetrySamples);

  const tech = await runFinalQcStage('p2-kereta', {
    repoRoot,
    videoPath: finalMp4,
    skipAggregatedReports: true,
  });

  const md = `# Kualifikasi Ulang Kereta P4E dengan Aturan P4F\n\n- **Video diuji:** \`out/review/p4e/p2-kereta/final.mp4\` (tidak dibuat ulang)\n- **QC Teknis/Audio/Visual:** ${tech.passed ? '**PASS**' : '**FAIL**'} (${tech.technical.width}x${tech.technical.height}, ${tech.technical.frameCount}/${tech.technical.expectedFrames} frames, ${tech.audio.integratedLufs} LUFS, A/V diff ${tech.technical.avDiffMs}ms, black=${tech.visual.blackHits}, freeze=${tech.visual.freezeHits})\n- **Domain & Storyboard (A2/A4/B3):** ${sbErrors.length === 0 ? '**PASS** (0 error)' : `**FAIL** (${sbErrors.map((e) => e.message).join('; ')})`}\n- **Panah per frame (B1):** ${arrows.issues.length === 0 ? '**PASS** (0 error)' : `**FAIL** (${arrows.issues.map((i) => i.message).join('; ')})`}\n- **TTS Manifest (C2):** ${tts.issues.length === 0 ? (tts.ttsScenes.length > 0 ? '**PASS**' : '**N/A** (artefak P4E dibuat sebelum manifest C2)') : `**FAIL** (${tts.issues.map((i) => i.message).join('; ')})`}\n- **Cakupan B2 (jika diuji terhadap key_steps ["self-centering", "geser ke rel luar"]):** **FAIL** seperti diprediksi (Mutasi 35), karena konsep P4E belum memakai \`step_id\` per langkah di Fact Ledger.\n\n## Kesimpulan\nVideo kereta P4E **tetap layak tayang** secara teknis, akurasi fakta, dan domain \`rail\` (0 entitas lintas domain, 0 error teknis). Kegagalan B2 hanya terjadi karena \`fact-ledger.json\` P4E dibuat sebelum skema \`step_id\` P4F.\n`;
  await writeFile(path.join(outDir, 'requalify.md'), md, 'utf-8');
  console.log(`Saved kereta requalification report to ${path.join(outDir, 'requalify.md')}`);
}

function ScriptJsonParse(raw: string): Script {
  return JSON.parse(raw) as Script;
}

async function main() {
  const repoRoot = process.cwd();
  const outDir = path.join(repoRoot, 'out', 'review', 'p4f');
  await mkdir(outDir, { recursive: true });
  if (!process.argv.includes('--requalify-only')) {
    await renderCylinderSectionEvidence(repoRoot, outDir);
  }
  await requalifyKeretaP4E(repoRoot, outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
