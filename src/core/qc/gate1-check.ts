import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';

export interface Gate1ApprovalResult {
  approved: boolean;
  reasons: string[];
  l1Updated: QcReport;
}

export async function validateGate1Approval(projectDir: string): Promise<Gate1ApprovalResult> {
  const readJson = async <T>(relPath: string): Promise<T | null> => {
    try {
      return JSON.parse(await readFile(path.join(projectDir, relPath), 'utf-8')) as T;
    } catch {
      return null;
    }
  };

  const script = await readJson<Script>('script.json');
  const ledger = await readJson<FactLedger>('fact-ledger.json');
  const l0 = await readJson<QcReport>('qc/L0.json');
  const l0b = await readJson<QcReport & { answers_question?: boolean }>('qc/L0b.json');
  const l1 = await readJson<QcReport>('qc/L1.json');
  const l2 = await readJson<QcReport>('qc/L2.json');
  const l3 = await readJson<QcReport>('qc/L3.json');

  if (!script || !ledger || !l1 || !l2) {
    return {
      approved: false,
      reasons: ['Artefak wajib (script.json / fact-ledger.json / qc/L1.json / qc/L2.json) belum lengkap.'],
      l1Updated: l1 ?? { layer: 'L1', issues: [] },
    };
  }

  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));
  const referencedIds = new Set(
    script.scenes.flatMap((s) => s.sentences.flatMap((st) => st.claim_refs))
  );

  // Downgrade L1 errors on unused claims to severity 'info' ("klaim dibuang: ...")
  const l1Updated: QcReport = {
    layer: 'L1',
    issues: l1.issues.map((iss) => {
      if (iss.severity === 'error' && !referencedIds.has(iss.ref)) {
        const cleanMsg = iss.message.startsWith('klaim dibuang:')
          ? iss.message
          : `klaim dibuang: ${iss.message}`;
        return { ...iss, severity: 'info', message: cleanMsg };
      }
      return iss;
    }),
  };
  await writeFile(path.join(projectDir, 'qc', 'L1.json'), JSON.stringify(l1Updated, null, 2), 'utf-8');

  const reasons: string[] = [];

  for (const [name, rep] of [
    ['L0', l0],
    ['L0b', l0b],
    ['L2', l2],
    ['L3', l3],
  ] as const) {
    if (!rep) continue;
    const errs = rep.issues.filter((i) => i.severity === 'error');
    if (errs.length > 0) {
      reasons.push(`${name}: ${errs.length} error (${errs[0]!.ref}: ${errs[0]!.message})`);
    }
  }

  if (l0b && l0b.answers_question === false) {
    reasons.push('L0b: answers_question = false');
  }

  const l1UsedErrors = l1Updated.issues.filter(
    (i) => i.severity === 'error' && referencedIds.has(i.ref)
  );
  if (l1UsedErrors.length > 0) {
    reasons.push(`L1: ${l1UsedErrors.length} error pada klaim yang dipakai naskah`);
  }

  const unverifiedRefs = [...referencedIds].filter(
    (cid) => claimMap.get(cid)?.status !== 'verified'
  );
  if (unverifiedRefs.length > 0) {
    reasons.push(`Script merujuk klaim belum verified: ${unverifiedRefs.join(', ')}`);
  }

  return {
    approved: reasons.length === 0,
    reasons,
    l1Updated,
  };
}
