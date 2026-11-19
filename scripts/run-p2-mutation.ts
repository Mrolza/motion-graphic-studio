import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { verifyScriptL0bAndL3 } from '@core/qc/l0b-quality';
import { verifyScriptL2 } from '@core/qc/l2-script';

interface MutationCaseResult {
  id: string;
  label: string;
  mutatedRef: string;
  description: string;
  l2Errors: string[];
  l0bIssues: string[];
  l3Errors: string[];
  caught: boolean;
}

function tweakFirstNumber(text: string): { changed: string; oldNum: string; newNum: string } | null {
  const m = text.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (!m) return null;
  const oldNum = m[1]!;
  // Swap last two digits or increment slightly for a subtle number mutation
  let newNum: string;
  if (oldNum.length >= 2) {
    const chars = oldNum.split('');
    const a = chars[chars.length - 2]!;
    const b = chars[chars.length - 1]!;
    if (a !== b && /\d/.test(a) && /\d/.test(b)) {
      chars[chars.length - 2] = b;
      chars[chars.length - 1] = a;
      newNum = chars.join('');
    } else {
      newNum = String(Number(oldNum.replace(/\./g, '')) + 7);
    }
  } else {
    newNum = String(Number(oldNum) + 2);
  }
  return { changed: text.replace(oldNum, newNum), oldNum, newNum };
}

async function main() {
  const outDir = path.join(process.cwd(), 'out', 'review', 'p2');
  const mutDir = path.join(outDir, 'mutation-test');
  await mkdir(mutDir, { recursive: true });

  const ledger = JSON.parse(
    await readFile(path.join(outDir, 'p2-kereta', 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;
  const baseScript = JSON.parse(
    await readFile(path.join(outDir, 'p2-kereta', 'script.json'), 'utf-8')
  ) as Script;

  const cases: Array<{ id: string; label: string; mutate: (s: Script) => { ref: string; desc: string } }> = [
    {
      id: 'mut1-similar-number',
      label: '1. Angka yang mirip',
      mutate: (s) => {
        for (const sc of s.scenes) {
          for (let i = 0; i < sc.sentences.length; i++) {
            const st = sc.sentences[i]!;
            if (!st.non_factual && st.claim_refs.length > 0) {
              const tweaked = tweakFirstNumber(st.text);
              if (tweaked) {
                st.text = tweaked.changed;
                return { ref: `${sc.id}.${i + 1}`, desc: `Ubah angka ${tweaked.oldNum} -> ${tweaked.newNum}` };
              }
            }
          }
        }
        // Fallback if no numeric sentence exists in baseScript
        const target = s.scenes[1]?.sentences[0] ?? s.scenes[0]!.sentences[0]!;
        target.text = `${target.text} Lebar relnya 1.453 mm.`;
        return { ref: `${s.scenes[1]?.id ?? s.scenes[0]!.id}.1`, desc: 'Sisipkan angka mirip 1.453 mm (bukan 1.435 mm)' };
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
          'Mekanisme roda dan flens tersebut justru dirancang untuk membuat kereta melaju dua kali lebih cepat, bukan untuk menjaga posisi di rel.';
        return { ref: `${sc.id}.${idx + 1}`, desc: 'Membalik sebab-akibat fungsi roda/flens menjadi penambah kecepatan' };
      },
    },
    {
      id: 'mut4-off-topic',
      label: '4. Menyimpang dari topik',
      mutate: (s) => {
        const sc = s.scenes[2] ?? s.scenes[1] ?? s.scenes[0]!;
        sc.sentences = [
          {
            text: 'Sementara itu, sayap pesawat terbang menghasilkan gaya angkat karena perbedaan tekanan udara di atas dan bawah sayap.',
            claim_refs: [],
            emphasis_words: ['pesawat'],
            non_factual: true,
          },
        ];
        return { ref: sc.id, desc: 'Mengganti satu scene dengan fakta pesawat terbang yang tidak relevan' };
      },
    },
  ];

  const results: MutationCaseResult[] = [];
  for (const c of cases) {
    const mutated: Script = JSON.parse(JSON.stringify(baseScript));
    const { ref, desc } = c.mutate(mutated);
    const l2 = verifyScriptL2(mutated, ledger, 45);
    const combined = await verifyScriptL0bAndL3({
      topic: 'Kenapa kereta tidak tergelincir?',
      script: mutated,
      ledger,
    });

    const l2Errors = l2.issues.filter((i) => i.severity === 'error').map((i) => `${i.ref}: ${i.message}`);
    const l0bIssues = combined.l0b.report.issues.map((i) => `${i.severity}: ${i.message}`);
    const l3Errors = combined.l3Report.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.ref}: ${i.message}`);

    const caught = l2Errors.length > 0 || l3Errors.length > 0 || !combined.l0b.answers_question || l0bIssues.length > 0;
    results.push({
      id: c.id,
      label: c.label,
      mutatedRef: ref,
      description: desc,
      l2Errors,
      l0bIssues,
      l3Errors,
      caught,
    });

    await writeFile(
      path.join(mutDir, `${c.id}.json`),
      JSON.stringify({ mutated, l2, l0b: combined.l0b, l3: combined.l3Report }, null, 2),
      'utf-8'
    );
  }

  const lines = [
    '# Uji Mutasi Halus (L2, L3, L0b) — p2-kereta',
    '',
    '| Mutasi | Target | Deskripsi | Tertangkap Oleh | Status |',
    '|---|---|---|---|---|',
  ];
  for (const r of results) {
    const catches = [
      r.l2Errors.length ? `L2 (${r.l2Errors[0]})` : '',
      r.l3Errors.length ? `L3 (${r.l3Errors[0]})` : '',
      r.l0bIssues.length ? `L0b (${r.l0bIssues[0]})` : '',
    ]
      .filter(Boolean)
      .join('<br>');
    lines.push(`| ${r.label} | \`${r.mutatedRef}\` | ${r.description} | ${catches || '-'} | ${r.caught ? 'TERTANGKAP' : 'LOLOS'} |`);
  }
  await writeFile(path.join(mutDir, 'mutation-summary.md'), lines.join('\n') + '\n', 'utf-8');
  console.log('Subtle mutation results:', results.map((r) => `${r.id}=${r.caught}`).join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
