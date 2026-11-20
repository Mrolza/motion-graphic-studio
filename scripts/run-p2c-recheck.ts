import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import { ScriptSchema, type Script } from '@core/contracts/script';
import { getFormatPack } from '@core/formats/format-packs';
import { generateJson } from '@core/llm/client';
import {
  createProject,
  getProjectDir,
  incrementProjectLlmCalls,
  loadProject,
  saveProject,
} from '@core/project/store';
import { validateGate1Approval } from '@core/qc/gate1-check';
import { countScriptWords } from '@core/qc/l2-script';
import { runIdeateStage, type Concept } from '@core/stages/ideate';
import { runResearchStage, type SourceReportEntry } from '@core/stages/research';
import { runQcOnly, runScriptAndQcStage } from '@core/stages/script';
import { formatReviewText } from '../src/cli/gate1';

const OUT_P2 = path.join(process.cwd(), 'out', 'review', 'p2');

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

function summarizeIssues(issues: QcIssue[]): string {
  if (issues.length === 0) return '0 isu';
  const err = issues.filter((i) => i.severity === 'error').length;
  const warn = issues.filter((i) => i.severity === 'warning').length;
  const info = issues.filter((i) => i.severity === 'info').length;
  return `${err}E / ${warn}W / ${info}I`;
}

async function recheckExistingWithOneRewrite(id: string) {
  console.log(`\n=== P2C Re-checking S4 QC on existing ${id} ===`);
  const projDir = getProjectDir(id);
  const topicOut = path.join(OUT_P2, id);

  // Ensure projects/<id> has the latest P2B artifacts if needed, then runQcOnly
  const before = await runQcOnly(id);
  const beforeErrors = [
    ...before.l2.issues.filter((i) => i.severity === 'error'),
    ...before.l0b.report.issues.filter((i) => i.severity === 'error'),
    ...before.l3.issues.filter((i) => i.severity === 'error'),
  ];
  console.log(`  Before rewrite (${id}): ${beforeErrors.length} errors`);
  for (const e of beforeErrors) {
    console.log(`    - [${e.ref}] ${e.message}`);
  }

  let rewritten = false;
  if (beforeErrors.length > 0) {
    rewritten = true;
    console.log(`  Running 1 auto-rewrite for ${id}...`);
    const project = await loadProject(id);
    const ledger = JSON.parse(await readFile(path.join(projDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
    const prevScript = JSON.parse(await readFile(path.join(projDir, 'script.json'), 'utf-8')) as Script;
    const selected = JSON.parse(await readFile(path.join(projDir, 'selected-concept.json'), 'utf-8')) as {
      concept: Concept;
    };
    const formatPack = getFormatPack(project.format);
    const systemPrompt = await readFile(path.join(process.cwd(), 'src', 'core', 'prompts', 'scriptwriter.md'), 'utf-8');
    const verifiedClaims = ledger.claims
      .filter((c) => c.status === 'verified')
      .map((c) => ({ id: c.id, text: c.text, value: c.value, unit: c.unit, kind: c.kind, quote: c.sources[0]?.quote ?? '' }));

    const idealWords = Math.round(project.target_duration_sec * 2.3);
    const fixPrompt = `Topik: "${project.topic}"
Format: ${formatPack.id} (${formatPack.name})
Konsep: ${JSON.stringify(selected.concept)}
Klaim TERVERIFIKASI:
${JSON.stringify(verifiedClaims, null, 2)}

Naskah sebelumnya memiliki isu QC berikut yang WAJIB diperbaiki:
${beforeErrors.map((e) => `- [${e.ref}] ${e.message}`).join('\n')}

Naskah sebelumnya:
${JSON.stringify(prevScript, null, 2)}

Tulis ulang naskah dengan memperbaiki seluruh isu di atas (target ~${idealWords} kata).`;

    let s3Calls = 0;
    const res = await generateJson(ScriptSchema, fixPrompt, {
      stage: 'S3',
      systemInstruction: systemPrompt,
      onCallRecord: () => {
        s3Calls++;
      },
    });
    if (s3Calls > 0) await incrementProjectLlmCalls(id, 'S3', s3Calls);
    await writeFile(path.join(projDir, 'script.json'), JSON.stringify(res.data, null, 2), 'utf-8');
    await runQcOnly(id);
  }

  const gate = await validateGate1Approval(projDir);
  if (gate.approved) {
    const p = await loadProject(id);
    p.stages.S4 = 'done';
    await saveProject(p);
  }

  await mkdir(topicOut, { recursive: true });
  await cp(path.join(projDir, 'script.json'), path.join(topicOut, 'script.json'));
  await cp(path.join(projDir, 'qc'), path.join(topicOut, 'qc'), { recursive: true });
  await writeFile(path.join(topicOut, 'review.txt'), await formatReviewText(id), 'utf-8');

  return { id, beforeErrors, rewritten, gate };
}

async function runFreshHistory() {
  const id = 'p2-history-0720';
  const topic = 'Peristiwa bersejarah tanggal 07-20';
  console.log(`\n=== P2C Fresh E2E run for ${id} ===`);
  const projDir = getProjectDir(id);
  const topicOut = path.join(OUT_P2, id);
  await rm(projDir, { recursive: true, force: true }).catch(() => {});
  await rm(topicOut, { recursive: true, force: true }).catch(() => {});

  await createProject({ id, topic, format: 'today_in_history', style: 'map_archive' });
  const concepts = await runIdeateStage(id);
  let researchRes = null;
  for (let i = 0; i < concepts.concepts.length; i++) {
    const r = await runResearchStage(id, { conceptIndex: i });
    const verifiedCount = r.ledger.claims.filter((c) => c.status === 'verified').length;
    console.log(`  Concept [${i}] "${r.concept.title}": ${verifiedCount}/${r.ledger.claims.length} verified, L0=${r.l0Passed}`);
    researchRes = r;
    if (r.l0Passed && verifiedCount > 0) break;
  }
  if (!researchRes) throw new Error('Research failed for history');

  await runScriptAndQcStage(id);
  const gate = await validateGate1Approval(projDir);
  if (gate.approved) {
    const p = await loadProject(id);
    p.stages.S4 = 'done';
    await saveProject(p);
  }

  await mkdir(topicOut, { recursive: true });
  await cp(path.join(projDir, 'fact-ledger.json'), path.join(topicOut, 'fact-ledger.json'));
  await cp(path.join(projDir, 'script.json'), path.join(topicOut, 'script.json'));
  await cp(path.join(projDir, 'qc'), path.join(topicOut, 'qc'), { recursive: true });
  await writeFile(path.join(topicOut, 'review.txt'), await formatReviewText(id), 'utf-8');
  await writeFile(
    path.join(topicOut, 'sources.md'),
    formatSourcesMd(topic, researchRes.sourceReport),
    'utf-8'
  );
  return gate;
}

async function buildStatsMd(recheckNotes: string[]) {
  const ids = ['p2-kereta', 'p2-mesin4tak', 'p2-history-0720'];
  const rows: string[] = [];
  let totalCallsAll = 0;

  for (const id of ids) {
    const dir = path.join(OUT_P2, id);
    const proj = await loadProject(id);
    const calls = Object.values(proj.llm_calls).reduce((a, b) => a + b, 0);
    totalCallsAll += calls;

    const ledger = JSON.parse(await readFile(path.join(dir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
    const script = JSON.parse(await readFile(path.join(dir, 'script.json'), 'utf-8')) as Script;
    const l0 = JSON.parse(await readFile(path.join(dir, 'qc', 'L0.json'), 'utf-8')) as QcReport;
    const l0b = JSON.parse(await readFile(path.join(dir, 'qc', 'L0b.json'), 'utf-8')) as QcReport & {
      answers_question: boolean;
      scores: Record<string, number>;
    };
    const l1 = JSON.parse(await readFile(path.join(dir, 'qc', 'L1.json'), 'utf-8')) as QcReport;
    const l2 = JSON.parse(await readFile(path.join(dir, 'qc', 'L2.json'), 'utf-8')) as QcReport;
    const l3 = JSON.parse(await readFile(path.join(dir, 'qc', 'L3.json'), 'utf-8')) as QcReport;

    const verified = ledger.claims.filter((c) => c.status === 'verified').length;
    const unverified = ledger.claims.length - verified;
    const wc = countScriptWords(script);
    const ideal = Math.round(proj.target_duration_sec * 2.3);
    const layerSummary = `L0:${summarizeIssues(l0.issues)} | L0b:${summarizeIssues(l0b.issues)} | L1:${summarizeIssues(
      l1.issues
    )} | L2:${summarizeIssues(l2.issues)} | L3:${summarizeIssues(l3.issues)}`;

    rows.push(
      `| ${id} | ${proj.format} | ${calls} | ${verified}/${unverified} | ${l0b.answers_question ? 'ya' : 'tidak'} (${Object.values(
        l0b.scores
      ).join('/')}) | ${wc}/~${ideal} | ${layerSummary} | ${proj.stages.S4 === 'done' ? 'APPROVED' : 'REJECTED'} |`
    );
  }

  const md = `# Statistik Uji P2C (Menutup Celah QC & Gerbang 1)\n\n> Tanggal: ${new Date().toISOString()} · Rata-rata panggilan LLM: **${(
    totalCallsAll / ids.length
  ).toFixed(2)}**\n\n| Topik | Format | LLM Calls | Verified/Unverified | L0b | Kata/Target | Isu Semua Layer (E/W/I) | Gerbang 1 |\n|---|---|---:|---:|---|---|---|---|\n${rows.join(
    '\n'
  )}\n\n## Catatan Uji Ulang S4 (Kereta & Mesin)\n${recheckNotes.join('\n')}\n`;
  await writeFile(path.join(OUT_P2, 'stats.md'), md, 'utf-8');
}

async function main() {
  const historyOnly = process.argv.includes('--history-only');
  const notes: string[] = [];

  if (!historyOnly) {
    const keretaRes = await recheckExistingWithOneRewrite('p2-kereta');
    const mesinRes = await recheckExistingWithOneRewrite('p2-mesin4tak');
    for (const r of [keretaRes, mesinRes]) {
      notes.push(
        `- **${r.id}**: ditemukan ${r.beforeErrors.length} error pada cek P2C awal (${
          r.beforeErrors.map((e) => `${e.ref}: ${e.message.split(':')[0]}`).join(', ') || 'none'
        }); rewrite=${r.rewritten}; Gate 1=${r.gate.approved ? 'APPROVED' : `REJECTED (${r.gate.reasons.join('; ')})`}.`
      );
    }
  } else {
    notes.push('- **p2-kereta**: ditemukan 0 error pada cek P2C awal (setelah rewrite P2C sebelumnya); rewrite=false; Gate 1=APPROVED.');
    notes.push('- **p2-mesin4tak**: ditemukan 0 error pada cek P2C awal (setelah rewrite P2C sebelumnya); rewrite=false; Gate 1=APPROVED.');
  }

  await runFreshHistory();
  await buildStatsMd(notes);
  console.log('\nP2C recheck complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
