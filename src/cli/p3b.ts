import { resetProjectLastRunCalls } from '@core/project/store';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { runPreviewRenderStage } from '@core/stages/preview';
import { runScenesStage } from '@core/stages/scene-coder';
import { runStoryboardStage } from '@core/stages/storyboard';
import { runVoiceStage } from '@core/stages/voice';

export async function cmdVoice(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs voice <id>');
  const res = await runVoiceStage(id);
  console.log(
    `Voice & timeline done for ${id}: total=${res.timeline.total_sec}s, scenes=${res.timeline.scenes.length}, vo=${res.voFullPath}`
  );
}

export async function cmdStoryboard(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs storyboard <id>');
  const sb = await runStoryboardStage(id);
  const qc = await runStoryboardQcStage(id);
  const errs = qc.report.issues.filter((i) => i.severity === 'error');
  console.log(
    `Storyboard & QC done for ${id}: scenes=${sb.scenes.length}, rewritten=${qc.rewritten}, errors=${errs.length}`
  );
  if (errs.length > 0) {
    for (const e of errs) console.log(`  ERROR [${e.ref}]: ${e.message}`);
    throw new Error(`Storyboard QC gagal (${errs.length} error) — pipeline dihentikan sebelum Scene Coder.`);
  }
}

export async function cmdScenes(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs scenes <id>');
  const records = await runScenesStage(id);
  for (const r of records) {
    console.log(
      `  ${r.sceneId}: passed=${r.passed}, fixes=${r.fixes}, lines=${r.lineCount}${
        r.errors.length > 0 ? ` (${r.errors[0]})` : ''
      }`
    );
  }
  if (records.some((r) => !r.passed)) process.exit(1);
}

export async function cmdRender(args: string[]) {
  const id = args[0];
  if (!id || !args.includes('--preview')) {
    throw new Error('Usage: mgs render <id> --preview');
  }
  const res = await runPreviewRenderStage(id);
  console.log(
    `Preview rendered for ${id}: ${res.previewPath} (video=${res.videoDurationSec}s, vo=${res.voDurationSec}s, render=${res.renderMs}ms)`
  );
}

export async function cmdRunVoiceToPreview(id: string) {
  await resetProjectLastRunCalls(id);
  console.log(`[1/4] S5 Voice & timeline for ${id}...`);
  await cmdVoice([id]);
  console.log(`[2/4] S6-S7 Storyboard & QC for ${id}...`);
  await cmdStoryboard([id]);
  console.log(`[3/4] S8-S9 Scene Coder & visual QC for ${id}...`);
  await cmdScenes([id]);
  console.log(`[4/4] Assembly & Preview render for ${id}...`);
  await cmdRender([id, '--preview']);
}
