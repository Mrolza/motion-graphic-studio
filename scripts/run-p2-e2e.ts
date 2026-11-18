import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { createProject, getProjectDir, loadProject, saveProject } from '@core/project/store';
import { verifyScriptL2 } from '@core/qc/l2-script';
import { verifyScriptL3 } from '@core/qc/l3-verifier';
import { runIdeateStage } from '@core/stages/ideate';
import { runResearchStage } from '@core/stages/research';
import { runScriptAndQcStage } from '@core/stages/script';
import { formatReviewText } from '../src/cli/gate1';

const OUT_P2 = path.join(process.cwd(), 'out', 'review', 'p2');

interface TopicRunConfig {
  id: string;
  topic: string;
  format: 'how_it_works' | 'technical' | 'today_in_history';
  style: 'blueprint' | 'map_archive';
}

const TOPICS: TopicRunConfig[] = [
  { id: 'p2-kereta', topic: 'Kenapa kereta tidak tergelincir?', format: 'how_it_works', style: 'blueprint' },
  { id: 'p2-mesin4tak', topic: 'Bagaimana mesin 4 tak bekerja?', format: 'technical', style: 'blueprint' },
  { id: 'p2-history-0720', topic: 'Peristiwa bersejarah tanggal 07-20', format: 'today_in_history', style: 'map_archive' },
];

async function main() {
  await mkdir(OUT_P2, { recursive: true });
  const statsRows: string[] = [];
  let totalCallsAll = 0;

  for (const t of TOPICS) {
    const topicOut = path.join(OUT_P2, t.id);
    const existingReview = path.join(topicOut, 'review.txt');
    let alreadyDone = false;
    try {
      await readFile(existingReview, 'utf-8');
      alreadyDone = true;
    } catch {
      alreadyDone = false;
    }

    if (alreadyDone) {
      console.log(`\nSkipping ${t.id} (already in out/review/p2/${t.id}/)`);
      const proj = await loadProject(t.id);
      const totalCalls = Object.values(proj.llm_calls).reduce((a, b) => a + b, 0);
      totalCallsAll += totalCalls;
      const ledger = JSON.parse(await readFile(path.join(topicOut, 'fact-ledger.json'), 'utf-8')) as FactLedger;
      const l1 = JSON.parse(await readFile(path.join(topicOut, 'qc', 'L1.json'), 'utf-8')) as QcReport;
      const l2 = JSON.parse(await readFile(path.join(topicOut, 'qc', 'L2.json'), 'utf-8')) as QcReport;
      const l3 = JSON.parse(await readFile(path.join(topicOut, 'qc', 'L3.json'), 'utf-8')) as QcReport;
      const verified = ledger.claims.filter((c) => c.status === 'verified').length;
      const unverified = ledger.claims.length - verified;
      const unverifiedReasons = l1.issues.map((i) => `${i.ref}: ${i.message.split(':')[0]}`).join(', ') || '-';
      const l2Err = l2.issues.filter((i) => i.severity === 'error').length;
      const l3Err = l3.issues.filter((i) => i.severity === 'error').length;
      statsRows.push(
        `| ${t.id} | ${t.format} | ${totalCalls} (S1:${proj.llm_calls.S1}, S2:${proj.llm_calls.S2}, S3:${proj.llm_calls.S3}, S4:${proj.llm_calls.S4}) | ${verified} / ${unverified} (${unverifiedReasons}) | ${l2Err} | ${l3Err} error, ${l3.issues.length - l3Err} warn | ${proj.stages.S4 === 'done' ? 'APPROVED' : 'NEEDS_REVIEW'} |`
      );
      continue;
    }

    console.log(`\n==============================\nRunning E2E Gate 1 for ${t.id}: "${t.topic}" (${t.format})\n==============================`);
    const projDir = getProjectDir(t.id);
    await rm(projDir, { recursive: true, force: true }).catch(() => {});
    await createProject({ id: t.id, topic: t.topic, format: t.format, style: t.style });

    const concepts = await runIdeateStage(t.id);
    let researchRes = null;
    for (let i = 0; i < concepts.concepts.length; i++) {
      const r = await runResearchStage(t.id, { conceptIndex: i });
      const verifiedCount = r.ledger.claims.filter((c) => c.status === 'verified').length;
      console.log(`  Concept [${i}] "${r.concept.title}": ${verifiedCount}/${r.ledger.claims.length} verified, L0=${r.l0Passed}`);
      researchRes = r;
      if (r.l0Passed && verifiedCount > 0) break;
    }
    if (!researchRes) throw new Error(`Research failed for ${t.id}`);

    const scriptRes = await runScriptAndQcStage(t.id);
    const proj = await loadProject(t.id);
    const totalCalls = Object.values(proj.llm_calls).reduce((a, b) => a + b, 0);
    totalCallsAll += totalCalls;

    const l2BeforeErr = scriptRes.l2Before.issues.filter((i) => i.severity === 'error').length;
    const l2FinalErr = scriptRes.l2Final.issues.filter((i) => i.severity === 'error').length;
    const l3FinalErr = scriptRes.l3Final.issues.filter((i) => i.severity === 'error').length;

    const l1 = JSON.parse(await readFile(path.join(projDir, 'qc', 'L1.json'), 'utf-8')) as QcReport;
    const verified = researchRes.ledger.claims.filter((c) => c.status === 'verified').length;
    const unverified = researchRes.ledger.claims.length - verified;
    const unverifiedReasons = l1.issues.map((i) => `${i.ref}: ${i.message.split(':')[0]}`).join(', ') || '-';

    let gate1Status = 'NEEDS_REVIEW';
    if (l2FinalErr === 0) {
      proj.stages.S4 = 'done';
      await saveProject(proj);
      gate1Status = 'APPROVED';
    }

    await mkdir(topicOut, { recursive: true });
    await cp(path.join(projDir, 'fact-ledger.json'), path.join(topicOut, 'fact-ledger.json'));
    await cp(path.join(projDir, 'script.json'), path.join(topicOut, 'script.json'));
    await cp(path.join(projDir, 'qc'), path.join(topicOut, 'qc'), { recursive: true });
    await writeFile(path.join(topicOut, 'review.txt'), await formatReviewText(t.id), 'utf-8');

    statsRows.push(
      `| ${t.id} | ${t.format} | ${totalCalls} (S1:${proj.llm_calls.S1}, S2:${proj.llm_calls.S2}, S3:${proj.llm_calls.S3}, S4:${proj.llm_calls.S4}) | ${verified} / ${unverified} (${unverifiedReasons}) | ${l2BeforeErr} → ${l2FinalErr} (rewrite=${scriptRes.rewritten}) | ${l3FinalErr} error, ${scriptRes.l3Final.issues.length - l3FinalErr} warn | ${gate1Status} |`
    );
  }

  // Mutation test on p2-kereta
  console.log('\n==============================\nRunning L2/L3 Mutation Test on p2-kereta\n==============================');
  const mutDir = path.join(OUT_P2, 'mutation-test');
  await mkdir(mutDir, { recursive: true });
  const keretaDir = getProjectDir('p2-kereta');
  const keretaLedger = JSON.parse(await readFile(path.join(keretaDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const keretaScript = JSON.parse(await readFile(path.join(keretaDir, 'script.json'), 'utf-8')) as Script;

  const mutatedScript: Script = JSON.parse(JSON.stringify(keretaScript));
  // Find first factual sentence and inject both a fabricated number and an overstated causal claim
  let mutatedRef = 'S1.1';
  let originalText = '';
  for (const sc of mutatedScript.scenes) {
    const idx = sc.sentences.findIndex((s) => !s.non_factual && s.claim_refs.length > 0);
    if (idx !== -1) {
      mutatedRef = `${sc.id}.${idx + 1}`;
      originalText = sc.sentences[idx]!.text;
      sc.sentences[idx]!.text = `${originalText} Kecepatan maksimalnya mencapai 9.999 km/jam sehingga mustahil tergelincir selamanya.`;
      break;
    }
  }

  const mutL2 = verifyScriptL2(mutatedScript, keretaLedger);
  const mutL3 = await verifyScriptL3(mutatedScript, keretaLedger);

  await writeFile(path.join(mutDir, 'mutated-script.json'), JSON.stringify(mutatedScript, null, 2), 'utf-8');
  await writeFile(path.join(mutDir, 'qc-L2-mutated.json'), JSON.stringify(mutL2, null, 2), 'utf-8');
  await writeFile(path.join(mutDir, 'qc-L3-mutated.json'), JSON.stringify(mutL3, null, 2), 'utf-8');
  await writeFile(
    path.join(mutDir, 'mutation-summary.md'),
    `# Uji Mutasi L2 & L3 — p2-kereta\n\n- **Kalimat termutasi:** \`${mutatedRef}\`\n- **Teks asli:** "${originalText}"\n- **Mutasi disisipkan:** menambahkan klaim angka palsu \`9.999 km/jam\` dan klaim absolut \`mustahil tergelincir selamanya\` tanpa mengubah \`fact-ledger.json\`.\n- **Hasil L2 (kode):** ${mutL2.issues.length} isu (${mutL2.issues.map((i) => `${i.severity}: ${i.message}`).join(' | ')})\n- **Hasil L3 (LLM verifier):** ${mutL3.issues.length} isu (${mutL3.issues.map((i) => `${i.severity}: ${i.message}`).join(' | ')})\n`,
    'utf-8'
  );

  const avgCalls = (totalCallsAll / TOPICS.length).toFixed(2);
  const statsMd = `# Statistik Uji End-to-End P2 (Gerbang 1)\n\n> Tanggal: ${new Date().toISOString()} · Rata-rata panggilan LLM per topik: **${avgCalls}** (target ≤ 7)\n\n| Topik | Format | Panggilan LLM | Klaim Verified / Unverified | Error L2 (Sebelum → Sesudah) | Temuan L3 | Status Gerbang 1 |\n|---|---|---|---:|---|---|---|\n${statsRows.join('\n')}\n`;
  await writeFile(path.join(OUT_P2, 'stats.md'), statsMd, 'utf-8');
  console.log('\nDone! Average LLM calls per topic:', avgCalls);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
