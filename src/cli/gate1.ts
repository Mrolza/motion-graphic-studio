import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { getProjectDir, loadProject, saveProject } from '@core/project/store';
import { validateGate1Approval } from '@core/qc/gate1-check';
import { runIdeateStage, type ConceptsOutput } from '@core/stages/ideate';
import { runResearchStage } from '@core/stages/research';
import { runQcOnly, runScriptAndQcStage } from '@core/stages/script';

export function parseFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${name}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : undefined;
}

export async function cmdIdeate(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs ideate <id>');
  const out = await runIdeateStage(id);
  console.log(`Generated ${out.concepts.length} concepts for ${id}:`);
  out.concepts.forEach((c, i) => {
    console.log(`  [${i}] ${c.title} (${c.core_claims.length} core claims)`);
  });
}

export async function cmdResearch(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs research <id> [--concept N]');
  const conceptIndex = Number(parseFlag(args, '--concept') ?? '0');
  const res = await runResearchStage(id, { conceptIndex });
  const verified = res.ledger.claims.filter((c) => c.status === 'verified').length;
  console.log(
    `Research done for ${id} (concept #${conceptIndex}: "${res.concept.title}"): ${verified}/${res.ledger.claims.length} verified, L0=${res.l0Passed ? 'PASS' : 'FAIL'}`
  );
  if (!res.l0Passed) {
    console.log('Core claims belum sepenuhnya didukung. Coba konsep berikutnya: --concept', conceptIndex + 1);
  }
}

export async function cmdScript(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs script <id>');
  const res = await runScriptAndQcStage(id);
  console.log(
    `Script & QC done for ${id}: scenes=${res.script.scenes.length}, rewritten=${res.rewritten}, L2_errors=${
      res.l2Final.issues.filter((i) => i.severity === 'error').length
    }, L3_errors=${res.l3Final.issues.filter((i) => i.severity === 'error').length}`
  );
}

export async function cmdQc(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs qc <id>');
  const { l2, l3 } = await runQcOnly(id);
  console.log(
    `QC re-run for ${id}: L2 issues=${l2.issues.length}, L3 issues=${l3.issues.length}`
  );
}

export async function cmdRun(args: string[]) {
  const id = args[0];
  const until = parseFlag(args, '--until');
  if (!id || until !== 'gate1') {
    throw new Error('Usage: mgs run <id> --until gate1');
  }

  let proj = await loadProject(id);
  const dir = getProjectDir(id);

  let concepts: ConceptsOutput;
  if (proj.stages.S1 === 'done') {
    console.log(`[1/3] S1 Ideation already done for ${id}, reusing concepts.json...`);
    concepts = JSON.parse(await readFile(path.join(dir, 'concepts.json'), 'utf-8')) as ConceptsOutput;
  } else {
    console.log(`[1/3] S1 Ideation for ${id}...`);
    concepts = await runIdeateStage(id);
  }

  proj = await loadProject(id);
  if (proj.stages.S2 === 'done') {
    console.log(`[2/3] S2 Research already done for ${id}, reusing fact-ledger.json...`);
  } else {
    console.log(`[2/3] S2 Research & L1/L0 for ${id}...`);
    let chosenIdx = -1;
    for (let i = 0; i < concepts.concepts.length; i++) {
      const res = await runResearchStage(id, { conceptIndex: i });
      const verifiedCount = res.ledger.claims.filter((c) => c.status === 'verified').length;
      console.log(
        `  Concept [${i}] "${res.concept.title}": ${verifiedCount}/${res.ledger.claims.length} verified, L0=${
          res.l0Passed ? 'PASS' : 'FAIL'
        }`
      );
      if (res.l0Passed && verifiedCount > 0) {
        chosenIdx = i;
        break;
      }
    }
    if (chosenIdx === -1) {
      throw new Error('Semua konsep gagal L0 (concept_unverifiable).');
    }
  }

  proj = await loadProject(id);
  if (proj.stages.S3 === 'done' && proj.stages.S4 === 'done') {
    console.log(`[3/3] S3/S4 Script & QC already done for ${id}, skipping...`);
  } else {
    console.log(`[3/3] S3 Script & S4 QC (L0b/L2/L3) for ${id}...`);
    const scriptRes = await runScriptAndQcStage(id);
    proj = await loadProject(id);
    console.log(
      `Gate 1 ready for ${id}: status=${proj.stages.S4}, words=${scriptRes.wordCount}, answers_question=${
        scriptRes.l0bFinal.answers_question
      }, rewritten=${scriptRes.rewritten}, total_llm_calls=${Object.values(proj.llm_calls).reduce(
        (a, b) => a + b,
        0
      )}`
    );
  }
}

export async function formatReviewText(id: string, repoRoot = process.cwd()): Promise<string> {
  const dir = getProjectDir(id, repoRoot);
  const project = await loadProject(id, repoRoot);
  const ledger = JSON.parse(await readFile(path.join(dir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const script = JSON.parse(await readFile(path.join(dir, 'script.json'), 'utf-8')) as Script;
  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));

  const qcReports: QcReport[] = [];
  for (const layer of ['L0', 'L0b', 'L1', 'L2', 'L3']) {
    try {
      qcReports.push(JSON.parse(await readFile(path.join(dir, 'qc', `${layer}.json`), 'utf-8')) as QcReport);
    } catch {
      // optional
    }
  }

  const lines: string[] = [];
  lines.push(`=== GATE 1 REVIEW: ${project.id} ===`);
  lines.push(`Topik: ${project.topic} | Format: ${project.format}`);
  lines.push('');

  for (const scene of script.scenes) {
    lines.push(`[Scene ${scene.id}]`);
    scene.sentences.forEach((sent, idx) => {
      const ref = `${scene.id}.${idx + 1}`;
      lines.push(`  ${ref}: ${sent.text}`);
      if (sent.non_factual) {
        lines.push(`    -> (non_factual: true)`);
      } else {
        for (const cid of sent.claim_refs) {
          const c = claimMap.get(cid);
          if (!c) {
            lines.push(`    -> [${cid}] MISSING CLAIM`);
          } else {
            const src = c.sources[0];
            lines.push(`    -> [${c.id} | ${c.status}] ${c.text}`);
            lines.push(`       Kutipan: "${src?.quote ?? ''}"`);
            lines.push(`       Sumber:  ${src?.url ?? ''}`);
          }
        }
      }
    });
    lines.push('');
  }

  lines.push('=== LAPORAN QC (L0-L3) ===');
  for (const rep of qcReports) {
    lines.push(`[${rep.layer}] ${rep.issues.length} isu`);
    for (const iss of rep.issues) {
      lines.push(`  ${iss.severity.toUpperCase()} (${iss.ref}): ${iss.message}`);
    }
  }

  return lines.join('\n') + '\n';
}

export async function cmdReview(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs review <id>');
  console.log(await formatReviewText(id));
}

export async function cmdApprove(args: string[]) {
  const id = args[0];
  if (!id) throw new Error('Usage: mgs approve <id>');
  const dir = getProjectDir(id);
  const check = await validateGate1Approval(dir);
  if (!check.approved) {
    throw new Error(`Gerbang 1 DITOLAK: ${check.reasons.join(' | ')}`);
  }

  const project = await loadProject(id);
  project.stages.S4 = 'done';
  await saveProject(project);
  console.log(`Gerbang 1 DISETUJUI untuk ${id}.`);
}
