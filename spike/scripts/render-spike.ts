import fs from 'node:fs';
import path from 'node:path';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import {
  bundleSpike,
  checkPngNotBlank,
  OUT_REVIEW_P0,
  SPIKE_ROOT,
} from './remotion-helper';

interface SceneSpec {
  id: string;
  componentName: string;
  durationSec: number;
}

async function main() {
  const specs: SceneSpec[] = JSON.parse(
    fs.readFileSync(path.join(SPIKE_ROOT, 'specs', 'scenes.json'), 'utf-8')
  );
  const generatedDir = path.join(SPIKE_ROOT, 'src', 'scenes', 'generated');
  const availableSpecs = specs.filter((s) =>
    fs.existsSync(path.join(generatedDir, `${s.componentName}.tsx`))
  );

  if (availableSpecs.length === 0) {
    throw new Error('No generated scenes found in src/scenes/generated/. Run npm run generate first.');
  }

  // Generate CombinedSpike.tsx with Sequence + smooth opacity transition
  const fps = 30;
  const fadeFrames = 8; // ~0.27s cross-fade transition
  const imports = availableSpecs
    .map((s) => `import { ${s.componentName} } from './generated/${s.componentName}';`)
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

export const CombinedSpike: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#071426' }}>
${sequences.join('\n')}
    </AbsoluteFill>
  );
};
`;

  fs.writeFileSync(path.join(SPIKE_ROOT, 'src', 'scenes', 'CombinedSpike.tsx'), combinedCode, 'utf-8');

  // Update Root.tsx to include CombinedSpike
  const rootCode = `import React from 'react';
import { Composition } from 'remotion';
import { BenchmarkScene } from './scenes/BenchmarkScene';
import { CombinedSpike } from './scenes/CombinedSpike';
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

  console.log(`Bundling CombinedSpike (${totalFrames} frames / ${(totalFrames / fps).toFixed(2)}s)...`);
  const serveUrl = await bundleSpike();
  const comp = await selectComposition({
    serveUrl,
    id: 'CombinedSpike',
    chromiumOptions: { gl: 'angle' },
  });

  const outMp4 = path.join(OUT_REVIEW_P0, 'spike.mp4');
  console.log(`Rendering ${outMp4}...`);
  const t0 = Date.now();
  await renderMedia({
    composition: comp,
    serveUrl,
    codec: 'h264',
    outputLocation: outMp4,
    concurrency: 2,
    chromiumOptions: { gl: 'angle' },
    logLevel: 'warn',
  });
  const renderMs = Date.now() - t0;
  console.log(`Rendered spike.mp4 in ${renderMs} ms`);

  // Render 3 stills per scene (start, mid, end) and verify none are blank
  const stillsDir = path.join(OUT_REVIEW_P0, 'stills');
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
    path.join(OUT_REVIEW_P0, 'spike-render-report.json'),
    JSON.stringify({ totalFrames, durationSec: totalFrames / fps, renderMs, stillChecks }, null, 2),
    'utf-8'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
