import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { verifyLedgerL1 } from '@core/qc/l1-ledger';
import { verifyScriptL0bAndL3 } from '@core/qc/l0b-quality';
import { verifyScriptL2 } from '@core/qc/l2-script';
import type { WikipediaSource } from '@core/research/wikipedia';

interface MutationCaseResult {
  id: string;
  label: string;
  target: string;
  description: string;
  errors: string[];
  caughtAsError: boolean;
}

function tweakFirstNumber(text: string): { changed: string; oldNum: string; newNum: string } | null {
  const m = text.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (!m) return null;
  const oldNum = m[1]!;
  const n = Number(oldNum.replace(/\./g, '').replace(',', '.'));
  const newNum = String(n + 7);
  return { changed: text.replace(oldNum, newNum), oldNum, newNum };
}

async function main() {
  const outDir = path.join(process.cwd(), 'out', 'review', 'p2');
  const mutDir = path.join(outDir, 'mutation-test');
  await mkdir(mutDir, { recursive: true });

  const keretaLedger = JSON.parse(
    await readFile(path.join(outDir, 'p2-kereta', 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;
  const keretaScript = JSON.parse(
    await readFile(path.join(outDir, 'p2-kereta', 'script.json'), 'utf-8')
  ) as Script;
  const mesinLedger = JSON.parse(
    await readFile(path.join(outDir, 'p2-mesin4tak', 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;
  const mesinScript = JSON.parse(
    await readFile(path.join(outDir, 'p2-mesin4tak', 'script.json'), 'utf-8')
  ) as Script;

  const scriptCases: Array<{
    id: string;
    label: string;
    topic?: string;
    baseScript?: Script;
    baseLedger?: FactLedger;
    mutate: (s: Script) => { ref: string; desc: string };
  }> = [
    {
      id: 'mut1-similar-number',
      label: '1. Angka yang mirip',
      mutate: (s) => {
        for (const sc of s.scenes) {
          for (let i = 0; i < sc.sentences.length; i++) {
            const st = sc.sentences[i]!;
            if (!st.non_factual && st.claim_refs.length > 0) {
              const tw = tweakFirstNumber(st.text);
              if (tw) {
                st.text = tw.changed;
                return { ref: `${sc.id}.${i + 1}`, desc: `Ubah angka ${tw.oldNum} -> ${tw.newNum}` };
              }
            }
          }
        }
        const st = s.scenes[1]?.sentences[0] ?? s.scenes[0]!.sentences[0]!;
        st.text = `${st.text} Lebar relnya 1.453 mm.`;
        return { ref: `${s.scenes[1]?.id ?? s.scenes[0]!.id}.1`, desc: 'Sisipkan angka mirip 1.453 mm' };
      },
    },
    {
      id: 'mut2-generalization',
      label: '2. Generalisasi berlebihan',
      mutate: (s) => {
        const sc = s.scenes[1] ?? s.scenes[0]!;
        const idx = Math.max(0, sc.sentences.findIndex((x) => !x.non_factual));
        sc.sentences[idx]!.text =
          'Semua kereta api modern di seluruh dunia memakai desain identik ini tanpa pengecualian sedikit pun.';
        return { ref: `${sc.id}.${idx + 1}`, desc: 'Generalisasi fakta spesifik ke semua kereta di dunia' };
      },
    },
    {
      id: 'mut3-cause-effect',
      label: '3. Sebab-akibat diubah',
      mutate: (s) => {
        const sc = s.scenes[2] ?? s.scenes[1] ?? s.scenes[0]!;
        const idx = Math.max(0, sc.sentences.findIndex((x) => !x.non_factual));
        sc.sentences[idx]!.text =
          'Bentuk kerucut itu justru dirancang untuk membuat kereta melaju dua kali lebih cepat, bukan untuk menjaga posisi di rel.';
        return { ref: `${sc.id}.${idx + 1}`, desc: 'Membalik sebab-akibat fungsi roda kerucut' };
      },
    },
    {
      id: 'mut4-off-topic',
      label: '4 & 8. Adegan menyimpang dari topik',
      mutate: (s) => {
        const sc = s.scenes[2] ?? s.scenes[1] ?? s.scenes[0]!;
        sc.sentences = [
          {
            text: 'Sementara itu, sayap pesawat terbang menghasilkan gaya angkat karena perbedaan tekanan udara.',
            claim_refs: [],
            emphasis_words: ['pesawat'],
            non_factual: true,
          },
        ];
        return { ref: sc.id, desc: 'Mengganti satu adegan dengan topik sayap pesawat (harus error L0b)' };
      },
    },
    {
      id: 'mut5-quantity-drop',
      label: '5. Parafrase hilangkan kuantitas',
      topic: 'Bagaimana mesin 4 tak bekerja?',
      baseScript: mesinScript,
      baseLedger: mesinLedger,
      mutate: (s) => {
        for (const sc of s.scenes) {
          for (let i = 0; i < sc.sentences.length; i++) {
            const st = sc.sentences[i]!;
            if (/dua putaran/i.test(st.text)) {
              st.text = st.text.replace(/dua putaran/i, 'putaran');
              return { ref: `${sc.id}.${i + 1}`, desc: 'Menghilangkan kata "dua" pada "dua putaran poros engkol"' };
            }
          }
        }
        const sc = s.scenes[0]!;
        const idx = Math.max(0, sc.sentences.findIndex((x) => !x.non_factual));
        sc.sentences[idx]!.text =
          'Siklus empat tak memerlukan putaran poros engkol penuh untuk menyelesaikan langkahnya.';
        return { ref: `${sc.id}.${idx + 1}`, desc: 'Menghilangkan kata "dua" pada "dua putaran poros engkol"' };
      },
    },
    {
      id: 'mut6-non-factual-assertion',
      label: '6. non_factual berisi penilaian',
      mutate: (s) => {
        const sc = s.scenes[s.scenes.length - 1]!;
        sc.sentences.push({
          text: 'Mesin ini adalah desain paling efisien yang pernah dibuat.',
          claim_refs: [],
          emphasis_words: ['efisien'],
          non_factual: true,
        });
        return { ref: `${sc.id}.${sc.sentences.length}`, desc: 'Kalimat penilaian ditandai non_factual: true' };
      },
    },
  ];

  const results: MutationCaseResult[] = [];
  for (const c of scriptCases) {
    const mutated: Script = JSON.parse(JSON.stringify(c.baseScript ?? keretaScript));
    const ledgerToUse = c.baseLedger ?? keretaLedger;
    const { ref, desc } = c.mutate(mutated);
    const l2 = verifyScriptL2(mutated, ledgerToUse, 45);
    const combined = await verifyScriptL0bAndL3({
      topic: c.topic ?? 'Kenapa kereta tidak tergelincir?',
      script: mutated,
      ledger: ledgerToUse,
    });

    const errors = [
      ...l2.issues.filter((i) => i.severity === 'error').map((i) => `L2(${i.ref}): ${i.message}`),
      ...combined.l0b.report.issues.filter((i) => i.severity === 'error').map((i) => `L0b(${i.ref}): ${i.message}`),
      ...combined.l3Report.issues.filter((i) => i.severity === 'error').map((i) => `L3(${i.ref}): ${i.message}`),
    ];

    results.push({
      id: c.id,
      label: c.label,
      target: ref,
      description: desc,
      errors,
      caughtAsError: errors.length > 0,
    });
    await writeFile(
      path.join(mutDir, `${c.id}.json`),
      JSON.stringify({ mutated, l2, l0b: combined.l0b, l3: combined.l3Report }, null, 2),
      'utf-8'
    );
  }

  // Mutation 7: L1 claim with date missing from quote
  const mut7Sources: WikipediaSource[] = [
    {
      source_id: 'S1',
      url: 'https://en.wikipedia.org/wiki/Apollo_11',
      title: 'Apollo 11',
      lang: 'en',
      text: 'It marked the 50th anniversary of the first Moon landing in a special ceremony.',
      retrieved_at: '2026-11-20T00:00:00.000Z',
    },
  ];
  const mut7L1 = verifyLedgerL1(
    [
      {
        id: 'C1',
        text: 'Apollo 11 mendarat di Bulan pada 20 Juli 1969.',
        kind: 'fact',
        status: 'unverified',
        sources: [
          {
            url: mut7Sources[0]!.url,
            title: 'Apollo 11',
            quote: 'It marked the 50th anniversary of the first Moon landing in a special ceremony.',
            retrieved_at: '2026-11-20T00:00:00.000Z',
          },
        ],
      },
    ],
    mut7Sources,
    { C1: 'S1' }
  );
  const mut7Errors = mut7L1.report.issues.filter((i) => i.severity === 'error').map((i) => `L1(${i.ref}): ${i.message}`);
  results.push({
    id: 'mut7-claim-date-not-in-quote',
    label: '7. Klaim tanggal tidak ada di kutipan',
    target: 'C1',
    description: 'Klaim menyebut "20 Juli 1969" dengan kutipan yang tidak memuat tanggal/tahun',
    errors: mut7Errors,
    caughtAsError: mut7Errors.length > 0,
  });
  await writeFile(path.join(mutDir, 'mut7-claim-date-not-in-quote.json'), JSON.stringify(mut7L1, null, 2), 'utf-8');

  const lines = [
    '# Uji Mutasi P2C (Mutasi 1–8, Semua Harus Error)',
    '',
    '| Mutasi | Target | Deskripsi | Error yang Menangkap | Status |',
    '|---|---|---|---|---|',
  ];
  for (const r of results) {
    lines.push(
      `| ${r.label} | \`${r.target}\` | ${r.description} | ${r.errors.join('<br>') || '-'} | ${
        r.caughtAsError ? 'TERTANGKAP (ERROR)' : 'LOLOS'
      } |`
    );
  }
  await writeFile(path.join(mutDir, 'mutation-summary.md'), lines.join('\n') + '\n', 'utf-8');
  console.log('P2C mutation results:', results.map((r) => `${r.id}=${r.caughtAsError}`).join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
