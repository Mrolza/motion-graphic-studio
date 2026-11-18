import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface HardwareInfo {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamMb: number;
  freeRamMb: number;
  gpus: Array<{ name: string; vendor: string }>;
  npu: string;
}

function inferVendor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('nvidia')) return 'NVIDIA';
  if (lower.includes('intel')) return 'Intel';
  if (lower.includes('amd') || lower.includes('radeon')) return 'AMD';
  if (lower.includes('apple')) return 'Apple';
  return 'unknown';
}

async function detectWindowsGpuAndNpu(): Promise<{
  gpus: Array<{ name: string; vendor: string }>;
  npu: string;
}> {
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name; "---NPU---"; Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\\bNPU\\b|AI Boost|Neural' } | Select-Object -ExpandProperty Name`,
      ],
      { timeout: 6000 }
    );
    const parts = stdout.split('---NPU---');
    const gpuLines = (parts[0] ?? '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const npuLines = (parts[1] ?? '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      gpus: gpuLines.map((name) => ({ name, vendor: inferVendor(name) })),
      npu: npuLines.length > 0 ? npuLines.join(', ') : 'unknown',
    };
  } catch {
    return { gpus: [], npu: 'unknown' };
  }
}

export async function detectHardware(): Promise<HardwareInfo> {
  const cpus = os.cpus();
  const base = {
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCores: cpus.length,
    totalRamMb: Math.round(os.totalmem() / (1024 * 1024)),
    freeRamMb: Math.round(os.freemem() / (1024 * 1024)),
  };

  if (os.platform() === 'win32') {
    const { gpus, npu } = await detectWindowsGpuAndNpu();
    return { ...base, gpus, npu };
  }

  return { ...base, gpus: [], npu: 'unknown' };
}
