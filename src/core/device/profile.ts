import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DeviceProfileName } from '@core/contracts/project';
import { runDeviceBenchmark, type GlBenchmarkEntry } from './benchmark';
import { detectHardware, type HardwareInfo } from './hardware';

export interface DeviceProfileRecord {
  profile: DeviceProfileName;
  overridden: boolean;
  reason: string;
  updated_at: string;
  hardware: HardwareInfo;
  benchmark: GlBenchmarkEntry[];
}

export function getDeviceProfilePath(repoRoot = process.cwd()): string {
  return path.join(repoRoot, '.mgs', 'device-profile.json');
}

export function selectProfileFromHardwareAndBenchmark(
  hardware: HardwareInfo,
  benchmark: GlBenchmarkEntry[]
): { profile: DeviceProfileName; reason: string } {
  const angle = benchmark.find((b) => b.gl === 'angle');
  const hasDiscreteNvidia = hardware.gpus.some((g) => /nvidia|rtx|gtx/i.test(g.name));

  if (!angle || !angle.ok) {
    return {
      profile: 'hemat',
      reason: 'WebGL angle unavailable or benchmark failed; using software swangle (hemat).',
    };
  }

  if (hasDiscreteNvidia && angle.renderMs < 10_000 && hardware.totalRamMb >= 15_000) {
    return {
      profile: 'penuh',
      reason: `Discrete NVIDIA GPU detected and angle benchmark fast (${angle.renderMs} ms).`,
    };
  }

  if (hardware.totalRamMb < 8_000) {
    return {
      profile: 'hemat',
      reason: `System RAM ${hardware.totalRamMb} MB < 8.000 MB; using hemat profile.`,
    };
  }

  return {
    profile: 'standar',
    reason: `angle benchmark OK (${angle.renderMs} ms, concurrency ${angle.concurrency}) on ${
      hardware.gpus[0]?.name ?? 'iGPU/CPU'
    }.`,
  };
}

export async function detectAndSaveDeviceProfile(
  repoRoot = process.cwd(),
  options?: { skipBenchmark?: boolean }
): Promise<DeviceProfileRecord> {
  const hardware = await detectHardware();
  const benchmark = options?.skipBenchmark ? [] : await runDeviceBenchmark(repoRoot);
  const { profile, reason } = options?.skipBenchmark
    ? {
        profile: 'standar' as DeviceProfileName,
        reason: 'Benchmark skipped; defaulted to standar.',
      }
    : selectProfileFromHardwareAndBenchmark(hardware, benchmark);

  const record: DeviceProfileRecord = {
    profile,
    overridden: false,
    reason,
    updated_at: new Date().toISOString(),
    hardware,
    benchmark,
  };

  const outPath = getDeviceProfilePath(repoRoot);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(record, null, 2), 'utf-8');
  return record;
}

export async function loadDeviceProfile(
  repoRoot = process.cwd()
): Promise<DeviceProfileRecord | null> {
  try {
    const raw = await readFile(getDeviceProfilePath(repoRoot), 'utf-8');
    return JSON.parse(raw) as DeviceProfileRecord;
  } catch {
    return null;
  }
}

export async function setDeviceProfileOverride(
  profile: DeviceProfileName,
  repoRoot = process.cwd()
): Promise<DeviceProfileRecord> {
  const existing = await loadDeviceProfile(repoRoot);
  const hardware = existing?.hardware ?? (await detectHardware());
  const record: DeviceProfileRecord = {
    profile,
    overridden: true,
    reason: `Manual override to "${profile}" via CLI.`,
    updated_at: new Date().toISOString(),
    hardware,
    benchmark: existing?.benchmark ?? [],
  };

  const outPath = getDeviceProfilePath(repoRoot);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(record, null, 2), 'utf-8');
  return record;
}
