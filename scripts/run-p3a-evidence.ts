import { execFile } from 'node:child_process';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { renderMedia, selectComposition } from '@remotion/renderer';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getRemotionBundle, runVisualQc } from '@core/qc/visual/runner';
import { DEMO_KERETA_SPEC, DEMO_MESIN_SPEC } from '@core/qc/visual/specs';

const execFileAsync = promisify(execFile);
const OUT_DIR = path.join(process.cwd(), 'out', 'review', 'p3a');

async function renderNormal(compositionId: string, outMp4: string): Promise<number> {
  const serveUrl = await getRemotionBundle();
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: { telemetry: false },
  });
  const t0 = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outMp4,
    inputProps: { telemetry: false },
    concurrency: 4,
    chromiumOptions: { gl: 'angle' },
  });
  return Date.now() - t0;
}

async function makeContactSheet(mp4Path: string, outPng: string, cols: number, rows: number) {
  await execFileAsync(ffmpegInstaller.path, [
    '-y',
    '-v',
    'error',
    '-i',
    mp4Path,
    '-vf',
    `fps=2,scale=270:480,tile=${cols}x${rows}`,
    '-frames:v',
    '1',
    outPng,
  ]);
}

async function main() {
  const qcDir = path.join(OUT_DIR, 'qc');
  const mutDir = path.join(OUT_DIR, 'mutations');
  await mkdir(qcDir, { recursive: true });
  await mkdir(mutDir, { recursive: true });

  console.log('1/4 Rendering DemoKereta (normal + telemetry QC)...');
  const keretaMp4 = path.join(OUT_DIR, 'demo-kereta.mp4');
  const keretaNormalMs = await renderNormal('DemoKereta', keretaMp4);
  const keretaQc = await runVisualQc({
    spec: DEMO_KERETA_SPEC,
    outputDir: qcDir,
    videoOutPath: path.join(qcDir, '_tmp_kereta_tel.mp4'),
    deviceProfile: 'standar',
  });
  await rm(path.join(qcDir, '_tmp_kereta_tel.mp4'), { force: true }).catch(() => {});
  await makeContactSheet(keretaMp4, path.join(OUT_DIR, 'demo-kereta-contact-sheet.png'), 6, 4);

  console.log('2/4 Rendering DemoMesin (normal + telemetry QC)...');
  const mesinMp4 = path.join(OUT_DIR, 'demo-mesin.mp4');
  const mesinNormalMs = await renderNormal('DemoMesin', mesinMp4);
  const mesinQc = await runVisualQc({
    spec: DEMO_MESIN_SPEC,
    outputDir: qcDir,
    videoOutPath: path.join(qcDir, '_tmp_mesin_tel.mp4'),
    deviceProfile: 'standar',
  });
  await rm(path.join(qcDir, '_tmp_mesin_tel.mp4'), { force: true }).catch(() => {});
  await makeContactSheet(mesinMp4, path.join(OUT_DIR, 'demo-mesin-contact-sheet.png'), 8, 4);

  console.log('3/4 Running 5 Visual QC mutations...');
  const mutations = [
    {
      id: 'mut1-time-valve',
      spec: DEMO_MESIN_SPEC,
      mutation: 'time-valve',
      expectedLayer: 'mechanics' as const,
      expectedCode: 'MECHANICS_INVARIANT',
    },
    {
      id: 'mut2-hud-easing',
      spec: DEMO_MESIN_SPEC,
      mutation: 'hud-easing',
      expectedLayer: 'mechanics' as const,
      expectedCode: 'MECHANICS_HUD_MISMATCH',
    },
    {
      id: 'mut3-framing',
      spec: DEMO_KERETA_SPEC,
      mutation: 'framing',
      expectedLayer: 'framing' as const,
      expectedCode: 'FRAMING_OUT_OF_BOUNDS',
    },
    {
      id: 'mut4-hud-overlap',
      spec: DEMO_KERETA_SPEC,
      mutation: 'hud-overlap',
      expectedLayer: 'hudOverlap' as const,
      expectedCode: 'HUD_OVERLAP',
    },
    {
      id: 'mut5-hud-format',
      spec: DEMO_KERETA_SPEC,
      mutation: 'hud-format',
      expectedLayer: 'hudFormat' as const,
      expectedCode: 'HUD_FORMAT_NOT_ID',
    },
  ];

  const mutRows: string[] = [];
  for (const m of mutations) {
    const tmpMp4 = path.join(mutDir, `_tmp_${m.id}.mp4`);
    const res = await runVisualQc({
      spec: { ...m.spec, compositionId: m.spec.compositionId },
      outputDir: path.join(mutDir, m.id),
      videoOutPath: tmpMp4,
      inputProps: { mutation: m.mutation },
      deviceProfile: 'standar',
    });
    await rm(tmpMp4, { force: true }).catch(() => {});
    const layerIssues = res.reports[m.expectedLayer].issues.filter((i) => i.severity === 'error');
    const caughtExpected = layerIssues.some((i) => i.message.includes(m.expectedCode));
    console.log(
      `  ${m.id}: passed=${res.passed}, ${m.expectedLayer} errors=${layerIssues.length}, caught=${caughtExpected}`
    );
    mutRows.push(
      `| ${m.id} | ${m.spec.compositionId} | ${m.expectedLayer} (\`${m.expectedCode}\`) | ${
        res.passed ? 'PASS (MISS)' : 'FAIL'
      } | ${layerIssues.length} error | ${caughtExpected ? 'TERTANGKAP' : 'GAGAL'} |`
    );
  }

  const mutSummary = `# Uji Mutasi QC Visual (P3A)\n\n| Mutasi | Komposisi | Target Cek | Status QC | Jumlah Error | Hasil |\n|---|---|---|---|---:|---|\n${mutRows.join(
    '\n'
  )}\n`;
  await writeFile(path.join(mutDir, 'mutation-summary.md'), mutSummary, 'utf-8');

  const perfMd = `# Performa Render P3A (Profil Standar: angle, concurrency=4)\n\n| Komposisi | Durasi | Normal (ms) | Telemetri ON (ms) | Overhead |\n|---|---|---:|---:|---:|\n| DemoKereta | 12s (360f) | ${keretaNormalMs} | ${keretaQc.renderMs} | +${(
    ((keretaQc.renderMs - keretaNormalMs) / Math.max(1, keretaNormalMs)) *
    100
  ).toFixed(1)}% |\n| DemoMesin | 16s (480f) | ${mesinNormalMs} | ${mesinQc.renderMs} | +${(
    ((mesinQc.renderMs - mesinNormalMs) / Math.max(1, mesinNormalMs)) *
    100
  ).toFixed(1)}% |\n`;
  await writeFile(path.join(OUT_DIR, 'perf.md'), perfMd, 'utf-8');

  await copyFile(path.join(process.cwd(), 'remotion', 'src', 'kit', 'KIT-API.md'), path.join(OUT_DIR, 'KIT-API.md'));
  await copyFile(path.join(process.cwd(), 'out', 'review', 'p2', 'followup.md'), path.join(OUT_DIR, 'followup.md'));

  console.log('\n4/4 P3A evidence generation complete!');
  console.log(`DemoKereta QC passed=${keretaQc.passed} (samples=${keretaQc.sampleCount})`);
  console.log(`DemoMesin QC passed=${mesinQc.passed} (samples=${mesinQc.sampleCount})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
