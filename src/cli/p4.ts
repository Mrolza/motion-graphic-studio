import { loadProject } from '@core/project/store';
import { DeviceProfileNameSchema } from '@core/contracts/project';
import { runFinalQcStage } from '@core/qc/final';
import { runFinalRenderStage } from '@core/stages/final-render';
import { runMixStage } from '@core/stages/mix';
import { generatePublishMarkdown } from '@core/stages/publish';
import { runScenesStage } from '@core/stages/scene-coder';
import { runStoryboardStage } from '@core/stages/storyboard';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { runVoiceStage, tightenExistingVoiceStage } from '@core/stages/voice';

function parseFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${name}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : undefined;
}

export async function cmdMix(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs mix <id>');
  const res = await runMixStage(id);
  console.log(
    `Mix (${id}): ${res.mixWavPath} | ${res.integratedLufs} LUFS | peak ${res.truePeakDbtp} dBFS | ${res.mixMs}ms`
  );
}

export async function cmdRenderFinal(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs render <id> --final [--profile hemat|standar|penuh]');
  const profRaw = parseFlag(args, '--profile');
  const profile = profRaw ? DeviceProfileNameSchema.parse(profRaw) : undefined;
  const res = await runFinalRenderStage(id, { profile });
  console.log(
    `Final Render (${id}): ${res.finalPath} | profile=${res.profile} | frames=${res.totalFrames} | chunks=${res.chunksCount} (skipped=${res.chunksSkipped}) | render=${res.renderMs}ms`
  );
}

export async function cmdQcFinal(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs qc-final <id>');
  const rep = await runFinalQcStage(id);
  console.log(`Final QC (${id}): ${rep.passed ? 'PASS' : 'FAIL'} (${rep.issues.length} issues)`);
  for (const iss of rep.issues) {
    console.log(`  [${iss.severity.toUpperCase()}] (${iss.ref ?? '-'}) ${iss.message}`);
  }
  if (!rep.passed) process.exit(1);
  const project = await loadProject(id);
  const pubPath = await generatePublishMarkdown(id, project.topic);
  console.log(`Publish info written: ${pubPath}`);
}

export async function cmdRunVoiceToFinal(id: string, options?: { reuseVo?: boolean; profile?: string }) {
  if (options?.reuseVo) {
    await tightenExistingVoiceStage(id);
  } else {
    await runVoiceStage(id);
  }
  await runStoryboardStage(id);
  const sbQc = await runStoryboardQcStage(id);
  if (sbQc.report.issues.some((i) => i.severity === 'error')) {
    throw new Error(`Storyboard QC failed for ${id}`);
  }
  await runScenesStage(id);
  await runMixStage(id);
  const profile = options?.profile ? DeviceProfileNameSchema.parse(options.profile) : undefined;
  await runFinalRenderStage(id, { profile });
  const finalRep = await runFinalQcStage(id);
  if (!finalRep.passed) {
    throw new Error(`Final QC FAILED for ${id}`);
  }
  const project = await loadProject(id);
  await generatePublishMarkdown(id, project.topic);
}
