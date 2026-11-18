import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { renderStill, selectComposition } from '@remotion/renderer';
import {
  bundleSpike,
  checkPngNotBlank,
  REPO_ROOT,
  SPIKE_ROOT,
} from './remotion-helper';
import { validateP0bSceneCode } from './validator-p0b';

const OUT_REVIEW_P0B = path.join(REPO_ROOT, 'out', 'review', 'p0b');

interface SceneSpec {
  id: string;
  componentName: string;
  durationSec: number;
  topic: string;
  description: string;
  crankCycleDeg: { from: number; to: number };
  camera: Record<string, unknown>;
  hud: Array<Record<string, unknown>>;
}

function extractTsxBlock(text: string): string {
  const fenceMatch = text.match(/```(?:tsx|typescript|ts)?\s*\n([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim() + '\n';
  }
  return text.trim() + '\n';
}

function writeTempEntry(
  compId: string,
  componentName: string,
  sceneRelPath: string,
  durationSec: number
): string {
  const tempRootPath = path.join(SPIKE_ROOT, 'src', '_TempP0bRoot.tsx');
  const tempIndexPath = path.join(SPIKE_ROOT, 'src', '_temp-p0b-index.ts');

  const rootCode = `import React from 'react';
import { Composition } from 'remotion';
import { ${componentName} } from '${sceneRelPath}';
import { BLUEPRINT_TOKENS } from './kit';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="${compId}"
    component={${componentName}}
    durationInFrames={${Math.round(durationSec * 30)}}
    fps={30}
    width={BLUEPRINT_TOKENS.viewport.width}
    height={BLUEPRINT_TOKENS.viewport.height}
  />
);
`;
  const indexCode = `import { registerRoot } from 'remotion';
import { RemotionRoot } from './_TempP0bRoot';
registerRoot(RemotionRoot);
`;
  fs.writeFileSync(tempRootPath, rootCode, 'utf-8');
  fs.writeFileSync(tempIndexPath, indexCode, 'utf-8');
  return tempIndexPath;
}

function cleanupTempEntry() {
  for (const f of ['_TempP0bRoot.tsx', '_temp-p0b-index.ts']) {
    const p = path.join(SPIKE_ROOT, 'src', f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function callGeminiWithRetry(
  ai: GoogleGenAI,
  model: string,
  contents: string,
  systemInstruction: string
) {
  for (let i = 0; i < 4; i++) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: { systemInstruction, temperature: 0.2 },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
      if (!isTransient || i === 3) throw err;
      const delayMs = 3000 * Math.pow(2, i);
      console.warn(`  Transient API error (${msg.slice(0, 80)}), retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Unreachable');
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment');
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemPrompt = fs.readFileSync(
    path.join(SPIKE_ROOT, 'prompts', 'scene-coder-p0b.md'),
    'utf-8'
  );
  const specs: SceneSpec[] = JSON.parse(
    fs.readFileSync(path.join(SPIKE_ROOT, 'specs', 'scenes-p0b.json'), 'utf-8')
  );

  const generatedDir = path.join(SPIKE_ROOT, 'src', 'scenes', 'generated-p0b');
  const reviewScenesDir = path.join(OUT_REVIEW_P0B, 'scenes');
  const reviewStillsDir = path.join(OUT_REVIEW_P0B, 'stills');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(reviewScenesDir, { recursive: true });
  fs.mkdirSync(reviewStillsDir, { recursive: true });

  let totalCalls = 0;
  let passedFirstTry = 0;
  let passedAfterRetry = 0;
  let failedTotal = 0;
  const perScene: Array<{
    id: string;
    calls: number;
    retries: number;
    status: 'passed_first' | 'passed_retry' | 'failed';
    errors: string[];
  }> = [];

  for (const spec of specs) {
    console.log(`\n=== Generating P0b ${spec.id} (${spec.durationSec}s) using ${model} ===`);
    const targetFile = path.join(generatedDir, `${spec.componentName}.tsx`);
    const rawArchiveFile = path.join(reviewScenesDir, `${spec.componentName}.raw.tsx`);
    const finalArchiveFile = path.join(reviewScenesDir, `${spec.componentName}.final.tsx`);

    let prompt = `Generate the Remotion scene component for this specification:\n\n\`\`\`json\n${JSON.stringify(
      spec,
      null,
      2
    )}\n\`\`\``;

    let attempts = 0;
    let passed = false;
    const errorLog: string[] = [];

    while (attempts <= 2 && !passed) {
      attempts++;
      totalCalls++;
      console.log(`  Gemini call #${attempts} for ${spec.id}...`);

      const resp = await callGeminiWithRetry(ai, model, prompt, systemPrompt);

      const code = extractTsxBlock(resp.text ?? '');
      if (attempts === 1) {
        fs.writeFileSync(rawArchiveFile, code, 'utf-8');
      }
      fs.writeFileSync(targetFile, code, 'utf-8');

      const val = validateP0bSceneCode(targetFile, spec.componentName);
      if (!val.ok) {
        const errMsg = val.errors.join('\n');
        console.warn(`  Validation failed:\n${errMsg}`);
        errorLog.push(`Attempt ${attempts} validation: ${errMsg}`);
        prompt = `The previous code for ${spec.componentName} failed validation:\n\n${errMsg}\n\nFix the code and return ONLY the corrected TSX inside a \`\`\`tsx block.\n\nPrevious code:\n\`\`\`tsx\n${code}\n\`\`\``;
        continue;
      }

      try {
        const compId = spec.componentName.replace(/_/g, '-');
        const tempIndex = writeTempEntry(
          compId,
          spec.componentName,
          `./scenes/generated-p0b/${spec.componentName}`,
          spec.durationSec
        );
        const serveUrl = await bundleSpike(tempIndex);
        const comp = await selectComposition({
          serveUrl,
          id: compId,
          chromiumOptions: { gl: 'angle' },
        });
        const midFrame = Math.floor((spec.durationSec * 30) / 2);
        const stillPath = path.join(reviewStillsDir, `${spec.id}-mid-check.png`);
        await renderStill({
          composition: comp,
          serveUrl,
          frame: midFrame,
          output: stillPath,
          chromiumOptions: { gl: 'angle' },
          logLevel: 'warn',
        });
        cleanupTempEntry();

        const blankCheck = checkPngNotBlank(stillPath);
        if (blankCheck.isBlank) {
          const errMsg = `Rendered middle frame (frame ${midFrame}) appears blank/uniform: ${JSON.stringify(
            blankCheck
          )}`;
          console.warn(`  ${errMsg}`);
          errorLog.push(`Attempt ${attempts} blank check: ${errMsg}`);
          prompt = `The previous code compiled, but the rendered middle frame was blank/empty (${errMsg}). Make sure the camera points at the 3D engine assembly.\n\nPrevious code:\n\`\`\`tsx\n${code}\n\`\`\``;
          continue;
        }

        console.log(
          `  PASSED on attempt ${attempts}! Still check: meanLuma=${blankCheck.meanLuma}, stdDev=${blankCheck.stdDevLuma}, nonBg=${blankCheck.nonBgRatio}`
        );
        fs.writeFileSync(finalArchiveFile, code, 'utf-8');
        passed = true;
      } catch (err) {
        cleanupTempEntry();
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`  Render error: ${errMsg}`);
        errorLog.push(`Attempt ${attempts} render: ${errMsg}`);
        prompt = `The previous code failed to render in Remotion:\n${errMsg}\n\nFix the code and return ONLY valid TSX.`;
      }
    }

    if (passed) {
      if (attempts === 1) {
        passedFirstTry++;
        perScene.push({ id: spec.id, calls: attempts, retries: 0, status: 'passed_first', errors: errorLog });
      } else {
        passedAfterRetry++;
        perScene.push({
          id: spec.id,
          calls: attempts,
          retries: attempts - 1,
          status: 'passed_retry',
          errors: errorLog,
        });
      }
    } else {
      failedTotal++;
      if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
      perScene.push({
        id: spec.id,
        calls: attempts,
        retries: attempts - 1,
        status: 'failed',
        errors: errorLog,
      });
    }
  }

  const stats = {
    timestamp: new Date().toISOString(),
    model,
    totalSpecs: specs.length,
    totalCalls,
    passedFirstTry,
    passedAfterRetry,
    failedTotal,
    perScene,
  };

  fs.writeFileSync(
    path.join(OUT_REVIEW_P0B, 'scene-coder-stats.json'),
    JSON.stringify(stats, null, 2),
    'utf-8'
  );
  console.log('\nP0b Scene Coder summary:', JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  cleanupTempEntry();
  console.error(err);
  process.exit(1);
});
