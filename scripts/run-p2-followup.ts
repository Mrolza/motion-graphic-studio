import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import { ScriptSchema } from '@core/contracts/script';
import { generateJson } from '@core/llm/client';
import {
  getProjectDir,
  incrementProjectLlmCalls,
  loadProject,
  resetProjectLastRunCalls,
  saveProject,
} from '@core/project/store';
import type { WikipediaSource } from '@core/research/wikipedia';
import { validateGate1Approval } from '@core/qc/gate1-check';
import { verifyLedgerL1 } from '@core/qc/l1-ledger';
import { runQcOnly } from '@core/stages/script';
import { formatReviewText } from '../src/cli/gate1';

async function main() {
  const id = 'p2-history-0720';
  const dir = getProjectDir(id);
  await resetProjectLastRunCalls(id);

  const ledger = JSON.parse(await readFile(path.join(dir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const sourceFiles = (await readdir(path.join(dir, 'sources'))).filter((f) => f.endsWith('.json'));
  const sources = (await Promise.all(
    sourceFiles.map(async (f) => JSON.parse(await readFile(path.join(dir, 'sources', f), 'utf-8')))
  )) as WikipediaSource[];

  const l1 = verifyLedgerL1(ledger.claims, sources);
  await writeFile(path.join(dir, 'fact-ledger.json'), JSON.stringify(l1.ledger, null, 2), 'utf-8');
  await writeFile(path.join(dir, 'qc', 'L1.json'), JSON.stringify(l1.report, null, 2), 'utf-8');
  const l1Errors = l1.report.issues.filter((i) => i.severity === 'error');
  console.log('L1 re-check errors:', l1Errors.map((e) => `${e.ref}: ${e.message}`));

  const before = await runQcOnly(id);
  const beforeErrors = [...before.l2.issues, ...before.l0b.report.issues, ...before.l3.issues].filter(
    (i) => i.severity === 'error'
  );
  console.log('S4 before rewrite errors:', beforeErrors.map((e) => `${e.ref}: ${e.message}`));

  let rewritten = false;
  let afterErrors = beforeErrors;
  if (beforeErrors.length > 0) {
    rewritten = true;
    const sys = await readFile(path.join(process.cwd(), 'src/core/prompts/scriptwriter.md'), 'utf-8');
    const oldScript = await readFile(path.join(dir, 'script.json'), 'utf-8');
    const verifiedClaims = l1.ledger.claims.filter((c) => c.status === 'verified');
    let s3Calls = 0;
    const rw = await generateJson(
      ScriptSchema,
      `Perbaiki naskah berikut agar lolos semua pemeriksaan (0 error) dalam 1 kali penulisan ulang:\n${beforeErrors
        .map((e) => `- [${e.ref}] ${e.message}`)
        .join('\n')}\n\nPastikan:\n1. Hook (S1.1) dibayar tuntas di isi naskah (jangan bahas hal di luar Fact Ledger).\n2. Adegan 1-2 menyebut "Apollo 11" dan "20 Juli 1969" secara eksplisit.\n3. Hanya gunakan claim_refs dari klaim verified berikut:\n${JSON.stringify(
        verifiedClaims,
        null,
        2
      )}\n\nNaskah lama:\n${oldScript}`,
      {
        stage: 'S3',
        systemInstruction: sys,
        onCallRecord: () => {
          s3Calls++;
        },
      }
    );
    if (s3Calls > 0) await incrementProjectLlmCalls(id, 'S3', s3Calls);
    await writeFile(path.join(dir, 'script.json'), JSON.stringify(rw.data, null, 2), 'utf-8');
    const after = await runQcOnly(id);
    afterErrors = [...after.l2.issues, ...after.l0b.report.issues, ...after.l3.issues].filter(
      (i) => i.severity === 'error'
    );
    console.log('S4 after rewrite errors:', afterErrors.map((e) => `${e.ref}: ${e.message}`));
  }

  const gate = await validateGate1Approval(dir);
  const updated = await loadProject(id);
  updated.stages.S4 = gate.approved ? 'done' : 'needs_review';
  await saveProject(updated);

  const outDir = path.join('out/review/p2', id);
  await cp(path.join(dir, 'fact-ledger.json'), path.join(outDir, 'fact-ledger.json'));
  await cp(path.join(dir, 'script.json'), path.join(outDir, 'script.json'));
  await cp(path.join(dir, 'qc'), path.join(outDir, 'qc'), { recursive: true });
  await writeFile(path.join(outDir, 'review.txt'), await formatReviewText(id), 'utf-8');

  const lastRunTotal = Object.values(updated.llm_calls_last_run ?? {}).reduce((a, b) => a + b, 0);
  const cumTotal = Object.values(updated.llm_calls).reduce((a, b) => a + b, 0);

  const followupMd = `# Tindak Lanjut REVIEW-P2C (Langkah 0 P3A)

> Tanggal: ${new Date().toISOString()} · Branch: \`phase/p2-facts-script\`

## 4 Tindak Lanjut yang Diterapkan
1. **\`CLAIM_NAME_NOT_IN_QUOTE\` (\`src/core/qc/l1-ledger.ts\`):** nama diri pada teks klaim wajib muncul di kutipan sumber (dengan padanan umum ID/EN seperti \`Bulan\`↔\`Moon\`).
2. **\`hook_paid\` di L0b (\`src/core/qc/l0b-quality.ts\`):** error \`L0B_HOOK_UNPAID\` jika janji/topik hook di S1 tidak dibahas di isi naskah.
3. **Nama kejadian utama di \`today_in_history\` (\`l0b-quality.ts\`, \`format-packs.ts\`, \`scriptwriter.md\`):** \`main_event_named\` wajib \`true\` (error \`L0B_MISSING_MAIN_EVENT_NAME\` jika nama misi/kejadian seperti \`Apollo 11\` tidak disebut).
4. **\`llm_calls_last_run\` terpisah (\`project.ts\`, \`store.ts\`, \`gate1.ts\`, \`script.ts\`):** mencatat panggilan LLM run terakhir terpisah dari \`llm_calls\` kumulatif.

## Hasil Uji Ulang S4 (\`p2-history-0720\`)
- **L1 re-check errors (termasuk \`CLAIM_NAME_NOT_IN_QUOTE\`):** ${l1Errors.length === 0 ? '0 error' : l1Errors.map((e) => `\`${e.ref}\`: ${e.message}`).join('; ')}
- **S4 sebelum rewrite:** ${beforeErrors.length} error (${beforeErrors.map((e) => `\`${e.ref}\` ${e.message.split(':')[0]}`).join(', ') || 'none'})
- **Rewrite (maks 1x):** ${rewritten ? 'ya' : 'tidak'}
- **S4 setelah rewrite:** ${afterErrors.length} error (${afterErrors.map((e) => `\`${e.ref}\` ${e.message.split(':')[0]}`).join(', ') || 'none'})
- **Gerbang 1:** ${gate.approved ? '**APPROVED**' : `**REJECTED** (${gate.reasons.join('; ')})`}
- **Panggilan LLM:** \`llm_calls_last_run\` = **${lastRunTotal}**, \`llm_calls\` (kumulatif) = **${cumTotal}**
`;
  await writeFile(path.join('out/review/p2', 'followup.md'), followupMd, 'utf-8');
  console.log('Gate1 approved:', gate.approved, 'last_run:', lastRunTotal, 'total:', cumTotal);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
