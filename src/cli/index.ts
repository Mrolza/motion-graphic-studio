import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import {
  ALL_STAGES,
  DeviceProfileNameSchema,
  VideoFormatSchema,
  VisualStyleSchema,
} from '@core/contracts/project';
import {
  detectAndSaveDeviceProfile,
  loadDeviceProfile,
  setDeviceProfileOverride,
} from '@core/device/profile';
import { createProject, loadProject } from '@core/project/store';
import {
  cmdApprove,
  cmdIdeate,
  cmdQc,
  cmdResearch,
  cmdReview,
  cmdRun,
  cmdScript,
} from './gate1';

const execFileAsync = promisify(execFile);

function parseFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${name}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : undefined;
}

async function runDoctor(args: string[]) {
  const skipBenchmark = args.includes('--skip-benchmark');
  const envVars = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'PIXABAY_API_KEY'];

  console.log('=== MGS Doctor ===');
  console.log('Environment variables (presence only):');
  for (const key of envVars) {
    const present = Boolean(process.env[key] && process.env[key]!.trim().length > 0);
    console.log(`  ${key}: ${present ? 'SET' : 'MISSING'}`);
  }

  // FFmpeg & ffprobe
  for (const [label, binPath] of [
    ['ffmpeg', ffmpegInstaller.path],
    ['ffprobe', ffprobeInstaller.path],
  ] as const) {
    try {
      const { stdout } = await execFileAsync(binPath, ['-version'], { timeout: 4000 });
      const firstLine = stdout.split(/\r?\n/)[0] ?? 'OK';
      console.log(`  ${label}: OK (${firstLine})`);
    } catch (err) {
      console.log(`  ${label}: ERROR (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // Remotion Chromium cache check
  const remotionCacheDir = path.join(process.cwd(), 'remotion', 'node_modules', '.remotion');
  const rootCacheDir = path.join(process.cwd(), 'node_modules', '.remotion');
  const hasRemotionChrome =
    fs.existsSync(remotionCacheDir) || fs.existsSync(rootCacheDir);
  console.log(`  remotion_chromium: ${hasRemotionChrome ? 'CACHED' : 'WILL_DOWNLOAD_ON_FIRST_RENDER'}`);

  console.log('\nRunning device detection & benchmark...');
  const profile = await detectAndSaveDeviceProfile(process.cwd(), { skipBenchmark });
  console.log(`  Profile: ${profile.profile}`);
  console.log(`  Reason: ${profile.reason}`);
  console.log(`  CPU: ${profile.hardware.cpuModel} (${profile.hardware.cpuCores} cores)`);
  console.log(`  RAM: ${profile.hardware.totalRamMb} MB`);
  console.log(
    `  GPU: ${profile.hardware.gpus.map((g) => `${g.vendor} ${g.name}`).join(', ') || 'unknown'}`
  );
  console.log(`  NPU: ${profile.hardware.npu}`);
  if (profile.benchmark.length > 0) {
    console.log('  Benchmark:');
    for (const b of profile.benchmark) {
      console.log(
        `    ${b.gl} (c=${b.concurrency}): ${b.ok ? `${b.renderMs} ms, minFreeRam=${b.minFreeRamMb} MB` : `ERR: ${b.error}`}`
      );
    }
  }
}

async function runNew(args: string[]) {
  const topic = parseFlag(args, '--topic');
  if (!topic) {
    throw new Error('Missing --topic "..."');
  }
  const format = VideoFormatSchema.parse(parseFlag(args, '--format') ?? 'how_it_works');
  const style = VisualStyleSchema.parse(parseFlag(args, '--style') ?? 'blueprint');
  const palette = parseFlag(args, '--palette') ?? 'blueprint-navy';
  const duration = Number(parseFlag(args, '--duration') ?? '45');
  const existingProfile = await loadDeviceProfile();

  const project = await createProject({
    topic,
    format,
    style,
    palette,
    target_duration_sec: duration,
    device_profile: existingProfile?.profile ?? 'standar',
  });
  console.log(JSON.stringify(project, null, 2));
}

async function runStatus(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs status <id>');
  const project = await loadProject(id);
  console.log(`Project: ${project.id}`);
  console.log(`Topic:   ${project.topic}`);
  console.log(`Format:  ${project.format} | Style: ${project.style} | Profile: ${project.device_profile}`);
  console.log('Stages:');
  for (const s of ALL_STAGES) {
    const st = project.stages[s] ?? 'pending';
    const calls = project.llm_calls[s] ?? 0;
    console.log(`  ${s}: ${st.padEnd(12)} (llm_calls: ${calls})`);
  }
}

async function runProfile(args: string[]) {
  const setVal = parseFlag(args, '--set');
  if (!setVal) {
    const cur = await loadDeviceProfile();
    console.log(cur ? JSON.stringify(cur, null, 2) : 'No device profile saved yet. Run: npm run mgs -- doctor');
    return;
  }
  const parsed = DeviceProfileNameSchema.parse(setVal);
  const updated = await setDeviceProfileOverride(parsed);
  console.log(`Device profile overridden to "${updated.profile}" (saved to .mgs/device-profile.json).`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'doctor') {
    await runDoctor(rest);
  } else if (cmd === 'new') {
    await runNew(rest);
  } else if (cmd === 'status') {
    await runStatus(rest);
  } else if (cmd === 'profile') {
    await runProfile(rest);
  } else if (cmd === 'ideate') {
    await cmdIdeate(rest);
  } else if (cmd === 'research') {
    await cmdResearch(rest);
  } else if (cmd === 'script') {
    await cmdScript(rest);
  } else if (cmd === 'qc') {
    await cmdQc(rest);
  } else if (cmd === 'run') {
    await cmdRun(rest);
  } else if (cmd === 'review') {
    await cmdReview(rest);
  } else if (cmd === 'approve') {
    await cmdApprove(rest);
  } else {
    console.log(
      'Usage: npm run mgs -- <doctor|new|status|profile|ideate|research|script|qc|run|review|approve> [options]'
    );
    process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
