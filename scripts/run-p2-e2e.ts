import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { createProject, getProjectDir, loadProject, saveProject } from '@core/project/store';
import { countScriptWords } from '@core/qc/l2-script';
import { runIdeateStage } from '@core/stages/ideate';
import { runResearchStage, type SourceReportEntry } from '@core/stages/research';
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

function formatSourcesMd(topic: string, entries: SourceReportEntry[]): string {
  const kept = entries.filter((e) => e.kept);
  const dropped = entries.filter((e) => !e.kept);
  const lines = [`# Sumber Riset — ${topic}`, ''];
  lines.push(`## Sumber Dipakai (${kept.length})`);
  for (const s of kept) {
    lines.push(`- **[${s.source_id}] ${s.title}** (${s.lang}) — \`${s.relevance}\`: ${s.url}`);
    lines.push(`  - Alasan: ${s.reason}`);
  }
  lines.push('', `## Sumber Dibuang (${dropped.length})`);
  if (dropped.length === 0) {
    lines.push('- (Tidak ada sumber yang dibuang)');
  } else {
    for (const s of dropped) {
      lines.push(`- **[${s.source_id}] ${s.title}** (${s.lang}) — \`${s.relevance}\`: ${s.url}`);
      lines.push(`  - Alasan: ${s.reason}`);
    }
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  await mkdir(OUT_P2, { recursive: true });
  const statsRows: string[] = [];
  let totalCallsAll = 0;

  for (const t of TOPICS) {
    const topicOut = path.join(OUT_P2, t.id);
    const projDir = getProjectDir(t.id);

    if (fresh) {
      await rm(projDir, { recursive: true, force: true }).catch(() => {});
      await rm(topicOut, { recursive: true, force: true }).catch(() => {});
    } else {
      try {
        await readFile(path.join(topicOut, 'review.txt'), 'utf-8');
        console.log(`\nSkipping ${t.id} (already in out/review/p2/${t.id}/)`);
        const proj = await loadProject(t.id);
        const totalCalls = Object.values(proj.llm_calls).reduce((a, b) => a + b, 0);
        totalCallsAll += totalCalls;
        const ledger = JSON.parse(await readFile(path.join(topicOut, 'fact-ledger.json'), 'utf-8')) as FactLedger;
        const script = JSON.parse(await readFile(path.join(topicOut, 'script.json'), 'utf-8')) as Script;
        const l1 = JSON.parse(await readFile(path.join(topicOut, 'qc', 'L1.json'), 'utf-8')) as QcReport;
        const l2 = JSON.parse(await readFile(path.join(topicOut, 'qc', 'L2.json'), 'utf-8')) as QcReport;
        const l3 = JSON.parse(await readFile(path.join(topicOut, 'qc', 'L3.json'), 'utf-8')) as QcReport;
        const l0b = JSON.parse(await readFile(path.join(topicOut, 'qc', 'L0b.json'), 'utf-8')) as {
          answers_question: boolean;
          scores: Record<string, number>;
        };
        const verified = ledger.claims.filter((c) => c.status === 'verified').length;
        const unverified = ledger.claims.length - verified;
        const unverifiedReasons = l1.issues.map((i) => `${i.ref}: ${i.message.split(':')[0]}`).join(', ') || '-';
        const l2Err = l2.issues.filter((i) => i.severity === 'error').length;
        const l3Err = l3.issues.filter((i) => i.severity === 'error').length;
        const idealWords = Math.round(proj.target_duration_sec * 2.3);
        const wc = countScriptWords(script);
        statsRows.push(
          `| ${t.id} | ${t.format} | ${totalCalls} (S1:${proj.llm_calls.S1}, S2:${proj.llm_calls.S2}, S3:${proj.llm_calls.S3}, S4:${proj.llm_calls.S4}) | ${verified} / ${unverified} (${unverifiedReasons}) | ${l0b.answers_question ? 'ya' : 'tidak'} (${Object.values(l0b.scores).join('/')}) | ${wc} / ~${idealWords} | ${l2Err} / ${l3Err} | ${proj.stages.S4 === 'done' ? 'APPROVED' : 'NEEDS_REVIEW'} |`
        );
        continue;
      } catch {
        // not done yet, run it
      }
    }

    console.log(`\n==============================\nRunning E2E Gate 1 for ${t.id}: "${t.topic}" (${t.format})\n==============================`);
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

    const l2FinalErr = scriptRes.l2Final.issues.filter((i) => i.severity === 'error').length;
    const l3FinalErr = scriptRes.l3Final.issues.filter((i) => i.severity === 'error').length;
    const l1 = JSON.parse(await readFile(path.join(projDir, 'qc', 'L1.json'), 'utf-8')) as QcReport;
    const verified = researchRes.ledger.claims.filter((c) => c.status === 'verified').length;
    const unverified = researchRes.ledger.claims.length - verified;
    const unverifiedReasons = l1.issues.map((i) => `${i.ref}: ${i.message.split(':')[0]}`).join(', ') || '-';

    let gate1Status = 'NEEDS_REVIEW';
    if (l2FinalErr === 0 && l3FinalErr === 0 && scriptRes.l0bFinal.answers_question) {
      proj.stages.S4 = 'done';
      await saveProject(proj);
      gate1Status = 'APPROVED';
    }

    await mkdir(topicOut, { recursive: true });
    await cp(path.join(projDir, 'fact-ledger.json'), path.join(topicOut, 'fact-ledger.json'));
    await cp(path.join(projDir, 'script.json'), path.join(topicOut, 'script.json'));
    await cp(path.join(projDir, 'qc'), path.join(topicOut, 'qc'), { recursive: true });
    await writeFile(path.join(topicOut, 'review.txt'), await formatReviewText(t.id), 'utf-8');
    await writeFile(
      path.join(topicOut, 'sources.md'),
      formatSourcesMd(t.topic, researchRes.sourceReport),
      'utf-8'
    );

    const idealWords = Math.round(proj.target_duration_sec * 2.3);
    const l0bScores = Object.values(scriptRes.l0bFinal.scores).join('/');
    statsRows.push(
      `| ${t.id} | ${t.format} | ${totalCalls} (S1:${proj.llm_calls.S1}, S2:${proj.llm_calls.S2}, S3:${proj.llm_calls.S3}, S4:${proj.llm_calls.S4}) | ${verified} / ${unverified} (${unverifiedReasons}) | ${scriptRes.l0bFinal.answers_question ? 'ya' : 'tidak'} (${l0bScores}) | ${scriptRes.wordCount} / ~${idealWords} | ${l2FinalErr} / ${l3FinalErr} | ${gate1Status} |`
    );
  }

  const avgCalls = (totalCallsAll / TOPICS.length).toFixed(2);
  const statsMd = `# Statistik Uji End-to-End P2B (Gerbang 1)\n\n> Tanggal: ${new Date().toISOString()} · Model: \`${
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
  }\` · Rata-rata panggilan LLM per topik: **${avgCalls}** (target ≤ 8)\n\n| Topik | Format | Panggilan LLM | Klaim Verified / Unverified | L0b (answers_question, skor) | Kata / Target | Error L2 / L3 | Status Gerbang 1 |\n|---|---|---|---:|---|---|---|---|\n${statsRows.join(
    '\n'
  )}\n`;
  await writeFile(path.join(OUT_P2, 'stats.md'), statsMd, 'utf-8');
  console.log('\nDone! Average LLM calls per topic:', avgCalls);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
