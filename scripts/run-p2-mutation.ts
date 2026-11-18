import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { verifyScriptL2 } from '@core/qc/l2-script';
import { verifyScriptL3 } from '@core/qc/l3-verifier';

async function main() {
  const outDir = path.join(process.cwd(), 'out', 'review', 'p2');
  const mutDir = path.join(outDir, 'mutation-test');
  await mkdir(mutDir, { recursive: true });

  const ledger = JSON.parse(
    await readFile(path.join(outDir, 'p2-kereta', 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;
  const script = JSON.parse(
    await readFile(path.join(outDir, 'p2-kereta', 'script.json'), 'utf-8')
  ) as Script;

  const mutated: Script = JSON.parse(JSON.stringify(script));
  let ref = 'S1.1';
  let orig = '';
  for (const sc of mutated.scenes) {
    const idx = sc.sentences.findIndex((s) => !s.non_factual && s.claim_refs.length > 0);
    if (idx !== -1) {
      ref = `${sc.id}.${idx + 1}`;
      orig = sc.sentences[idx]!.text;
      sc.sentences[idx]!.text = `${orig} Kecepatan maksimalnya mencapai 9.999 km/jam sehingga mustahil tergelincir selamanya.`;
      break;
    }
  }

  const mutL2 = verifyScriptL2(mutated, ledger);
  const mutL3 = await verifyScriptL3(mutated, ledger);

  await writeFile(path.join(mutDir, 'mutated-script.json'), JSON.stringify(mutated, null, 2), 'utf-8');
  await writeFile(path.join(mutDir, 'qc-L2-mutated.json'), JSON.stringify(mutL2, null, 2), 'utf-8');
  await writeFile(path.join(mutDir, 'qc-L3-mutated.json'), JSON.stringify(mutL3, null, 2), 'utf-8');
  await writeFile(
    path.join(mutDir, 'mutation-summary.md'),
    `# Uji Mutasi L2 & L3 — p2-kereta\n\n- **Kalimat termutasi:** \`${ref}\`\n- **Teks asli:** "${orig}"\n- **Mutasi:** menambahkan angka palsu \`9.999 km/jam\` & klaim absolut \`mustahil tergelincir selamanya\`.\n- **L2 (kode):** ${mutL2.issues.length} isu (${mutL2.issues.map((i) => `${i.severity}: ${i.message}`).join(' | ')})\n- **L3 (LLM):** ${mutL3.issues.length} isu (${mutL3.issues.map((i) => `${i.severity}: ${i.message}`).join(' | ')})\n`,
    'utf-8'
  );
  console.log('MUTATION TEST OK: L2=', mutL2.issues.length, 'L3=', mutL3.issues.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
