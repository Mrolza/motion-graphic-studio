import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { verifyScriptL0bAndL3 } from './l0b-quality';

export async function verifyScriptL3(
  script: Script,
  ledger: FactLedger,
  options?: { topic?: string; onCall?: () => void }
): Promise<QcReport> {
  const combined = await verifyScriptL0bAndL3({
    topic: options?.topic ?? 'Verifikasi klaim naskah',
    script,
    ledger,
    onCall: () => options?.onCall?.(),
  });
  return combined.l3Report;
}
