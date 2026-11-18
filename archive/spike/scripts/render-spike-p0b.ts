import fs from 'node:fs';
import path from 'node:path';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import {
  bundleSpike,
  checkPngNotBlank,
  REPO_ROOT,
  SPIKE_ROOT,
} from './remotion-helper';
import { solveCrankSlider } from '../src/kit/linkage';

const OUT_REVIEW_P0B = path.join(REPO_ROOT, 'out', 'review', 'p0b');

interface SceneSpec {
  id: string;
  componentName: string;
  durationSec: number;
}

function writeMechanicsCheck(availableSpecs: SceneSpec[]) {
  const crankCenter: [number, number, number] = [0, 1.0, 0];
  const crankRadius = 0.45;
  const rodLength = 1.45;

  const rows: string[] = [];
  for (let deg = 0; deg <= 720; deg += 60) {
    const rad = (deg * Math.PI) / 180;
    const sol = solveCrankSlider({ crankAngleRad: rad, crankRadius, rodLength, crankCenter });
    const phase =
      deg < 180
        ? '1. Hisap'
        : deg < 360
        ? '2. Kompresi'
        : deg < 540
        ? '3. Usaha'
        : deg < 720
        ? '4. Buang'
        : 'TDC (Akhir Siklus)';
    const intake = deg > 0 && deg < 180 ? 'TERBUKA' : 'Tutup';
    const exhaust = deg > 540 && deg < 720 ? 'TERBUKA' : 'Tutup';
    const spark = deg === 360 ? 'BUSI MENYALA' : '-';
    rows.push(
      `| ${deg}° | ${sol.pistonPin[1].toFixed(3)} | ${sol.crankPin[0].toFixed(3)}, ${sol.crankPin[1].toFixed(
        3
      )} | ${(sol.rodRotationZ * (180 / Math.PI)).toFixed(1)}° | ${phase} | ${intake} | ${exhaust} | ${spark} |`
    );
  }

  const sceneChecks = availableSpecs.map((s) => {
    const code = fs.readFileSync(
      path.join(SPIKE_ROOT, 'src', 'scenes', 'generated-p0b', `${s.componentName}.tsx`),
      'utf-8'
    );
    const usesLinkage = /\bsolveCrankSlider\s*\(/.test(code);
    const hasCutaway = /\bcutaway\b|\bthetaLength\b/.test(code);
    const hasValves = /intake|hisap|exhaust|buang/i.test(code);
    return `- **${s.id}:** \`solveCrankSlider\` = ${usesLinkage ? 'YA' : 'TIDAK'}, \`cutaway/thetaLength\` = ${
      hasCutaway ? 'YA' : 'TIDAK'
    }, katup = ${hasValves ? 'YA' : 'TIDAK'}`;
  });

  const md = `# Mechanics Check — P0b (Mesin 4 Tak)

Verifikasi matematis \`solveCrankSlider(crankRadius=${crankRadius}, rodLength=${rodLength}, crankCenter=[0, 1.0, 0])\`:
- **TDC (Titik Mati Atas):** \`1.0 + 1.45 + 0.45 = 2.900\`
- **BDC (Titik Mati Bawah):** \`1.0 + 1.45 - 0.45 = 2.000\`

## Tabel Sudut Engkol vs Posisi Piston & Urutan Katup

| Sudut Engkol | Piston Y | CrankPin (X, Y) | Sudut Batang | Langkah | Katup Hisap | Katup Buang | Busi |
|---:|---:|---|---:|---|---|---|---|
${rows.join('\n')}

## Verifikasi Kode Adegan Gemini
${sceneChecks.join('\n')}
`;

  fs.writeFileSync(path.join(OUT_REVIEW_P0B, 'mechanics-check.md'), md, 'utf-8');
}

async function main() {
  const specs: SceneSpec[] = JSON.parse(
    fs.readFileSync(path.join(SPIKE_ROOT, 'specs', 'scenes-p0b.json'), 'utf-8')
  );
  const generatedDir = path.join(SPIKE_ROOT, 'src', 'scenes', 'generated-p0b');
  const availableSpecs = specs.filter((s) =>
    fs.existsSync(path.join(generatedDir, `${s.componentName}.tsx`))
  );

  if (availableSpecs.length === 0) {
    throw new Error('No P0b generated scenes found. Run npm run generate:p0b first.');
  }

  writeMechanicsCheck(availableSpecs);

  const fps = 30;
  const fadeFrames = 8;
  const imports = availableSpecs
    .map((s) => `import { ${s.componentName} } from './generated-p0b/${s.componentName}';`)
    .join('\n');

  let cursor = 0;
  const sequences: string[] = [];
  const sceneRanges: Array<{ id: string; startFrame: number; durationFrames: number }> = [];

  for (let i = 0; i < availableSpecs.length; i++) {
    const s = availableSpecs[i];
    const durFrames = Math.round(s.durationSec * fps);
    const from = i === 0 ? 0 : cursor - fadeFrames;
    sceneRanges.push({ id: s.id, startFrame: from, durationFrames: durFrames });
    sequences.push(`      <Sequence from={${from}} durationInFrames={${durFrames}}>
        <FadeWrapper durationInFrames={${durFrames}} fadeIn={${i > 0}} fadeOut={${i < availableSpecs.length - 1}}>
          <${s.componentName} />
        </FadeWrapper>
      </Sequence>`);
    cursor = from + durFrames;
  }

  const totalFrames = cursor;
  const combinedCode = `import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
${imports}

const FadeWrapper: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
  fadeIn: boolean;
  fadeOut: boolean;
}> = ({ children, durationInFrames, fadeIn, fadeOut }) => {
  const frame = useCurrentFrame();
  const inOpacity = fadeIn ? interpolate(frame, [0, ${fadeFrames}], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  const outOpacity = fadeOut
    ? interpolate(frame, [durationInFrames - ${fadeFrames}, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
    : 1;
  return <AbsoluteFill style={{ opacity: Math.min(inOpacity, outOpacity) }}>{children}</AbsoluteFill>;
};

export const CombinedSpikeP0b: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#071426' }}>
${sequences.join('\n')}
    </AbsoluteFill>
  );
};
`;

  fs.writeFileSync(path.join(SPIKE_ROOT, 'src', 'scenes', 'CombinedSpikeP0b.tsx'), combinedCode, 'utf-8');

  const rootCode = `import React from 'react';
import { Composition } from 'remotion';
import { BenchmarkScene } from './scenes/BenchmarkScene';
import { CombinedSpike } from './scenes/CombinedSpike';
import { CombinedSpikeP0b } from './scenes/CombinedSpikeP0b';
import { BLUEPRINT_TOKENS } from './kit';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BenchmarkScene"
        component={BenchmarkScene}
        durationInFrames={180}
        fps={BLUEPRINT_TOKENS.viewport.fps}
        width={BLUEPRINT_TOKENS.viewport.width}
        height={BLUEPRINT_TOKENS.viewport.height}
      />
      <Composition
        id="CombinedSpike"
        component={CombinedSpike}
        durationInFrames={726}
        fps={BLUEPRINT_TOKENS.viewport.fps}
        width={BLUEPRINT_TOKENS.viewport.width}
        height={BLUEPRINT_TOKENS.viewport.height}
      />
      <Composition
        id="CombinedSpikeP0b"
        component={CombinedSpikeP0b}
        durationInFrames={${totalFrames}}
        fps={BLUEPRINT_TOKENS.viewport.fps}
        width={BLUEPRINT_TOKENS.viewport.width}
        height={BLUEPRINT_TOKENS.viewport.height}
      />
    </>
  );
};
`;
  fs.writeFileSync(path.join(SPIKE_ROOT, 'src', 'Root.tsx'), rootCode, 'utf-8');

  console.log(`Bundling CombinedSpikeP0b (${totalFrames} frames / ${(totalFrames / fps).toFixed(2)}s)...`);
  const serveUrl = await bundleSpike();
  const comp = await selectComposition({
    serveUrl,
    id: 'CombinedSpikeP0b',
    chromiumOptions: { gl: 'angle' },
  });

  const outMp4 = path.join(OUT_REVIEW_P0B, 'spike2.mp4');
  console.log(`Rendering ${outMp4}...`);
  const t0 = Date.now();
  await renderMedia({
    composition: comp,
    serveUrl,
    codec: 'h264',
    outputLocation: outMp4,
    concurrency: 2,
    chromiumOptions: { gl: 'angle' },
    hardwareAcceleration: 'disable',
    logLevel: 'warn',
  });
  const renderMs = Date.now() - t0;
  console.log(`Rendered spike2.mp4 in ${renderMs} ms`);

  const stillsDir = path.join(OUT_REVIEW_P0B, 'stills');
  fs.mkdirSync(stillsDir, { recursive: true });
  const stillChecks: Array<{ file: string; frame: number; isBlank: boolean; meanLuma: number; nonBgRatio: number }> = [];

  for (const r of sceneRanges) {
    const startF = r.startFrame + 10;
    const midF = r.startFrame + Math.floor(r.durationFrames / 2);
    const endF = r.startFrame + r.durationFrames - 10;

    for (const [label, frame] of [
      ['start', startF],
      ['mid', midF],
      ['end', endF],
    ] as const) {
      const outPng = path.join(stillsDir, `${r.id}-${label}.png`);
      await renderStill({
        composition: comp,
        serveUrl,
        frame,
        output: outPng,
        chromiumOptions: { gl: 'angle' },
        logLevel: 'warn',
      });
      const check = checkPngNotBlank(outPng);
      stillChecks.push({
        file: path.basename(outPng),
        frame,
        isBlank: check.isBlank,
        meanLuma: check.meanLuma,
        nonBgRatio: check.nonBgRatio,
      });
      console.log(`  Still ${path.basename(outPng)} (f=${frame}): blank=${check.isBlank}, luma=${check.meanLuma}`);
    }
  }

  fs.writeFileSync(
    path.join(OUT_REVIEW_P0B, 'spike-render-report.json'),
    JSON.stringify({ totalFrames, durationSec: totalFrames / fps, renderMs, stillChecks }, null, 2),
    'utf-8'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
