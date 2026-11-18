import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcReport } from '@core/contracts/qc-report';
import { ScriptSchema, type Script } from '@core/contracts/script';
import { getFormatPack } from '@core/formats/format-packs';
import { generateJson } from '@core/llm/client';
import {
  getProjectDir,
  incrementProjectLlmCalls,
  loadProject,
  saveProject,
} from '@core/project/store';
import { verifyScriptL2 } from '@core/qc/l2-script';
import { verifyScriptL3 } from '@core/qc/l3-verifier';
import type { Concept } from '@core/stages/ideate';

export interface ScriptAndQcResult {
  script: Script;
  l2Before: QcReport;
  l3Before: QcReport;
  l2Final: QcReport;
  l3Final: QcReport;
  rewritten: boolean;
}

export async function runQcOnly(
  projectId: string,
  repoRoot = process.cwd()
): Promise<{ l2: QcReport; l3: QcReport }> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  project.stages.S4 = 'running';
  await saveProject(project, repoRoot);

  const ledger = JSON.parse(
    await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;
  const script = ScriptSchema.parse(
    JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8'))
  );

  let l3Calls = 0;
  try {
    const l2 = verifyScriptL2(script, ledger);
    const l3 = await verifyScriptL3(script, ledger, {
      onCall: () => {
        l3Calls++;
      },
    });

    const qcDir = path.join(projectDir, 'qc');
    await mkdir(qcDir, { recursive: true });
    await writeFile(path.join(qcDir, 'L2.json'), JSON.stringify(l2, null, 2), 'utf-8');
    await writeFile(path.join(qcDir, 'L3.json'), JSON.stringify(l3, null, 2), 'utf-8');

    if (l3Calls > 0) {
      await incrementProjectLlmCalls(projectId, 'S4', l3Calls, repoRoot);
    }
    const hasErrors =
      l2.issues.some((i) => i.severity === 'error') ||
      l3.issues.some((i) => i.severity === 'error');
    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S4 = hasErrors ? 'needs_review' : 'done';
    await saveProject(updated, repoRoot);
    return { l2, l3 };
  } catch (err) {
    if (l3Calls > 0) {
      await incrementProjectLlmCalls(projectId, 'S4', l3Calls, repoRoot).catch(() => {});
    }
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S4 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}

export async function runScriptAndQcStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<ScriptAndQcResult> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  project.stages.S3 = 'running';
  await saveProject(project, repoRoot);

  const ledger = JSON.parse(
    await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')
  ) as FactLedger;
  const verifiedClaims = ledger.claims.filter((c) => c.status === 'verified');
  if (verifiedClaims.length === 0) {
    throw new Error('No verified claims in fact-ledger.json; cannot generate script.');
  }

  const selectedRaw = JSON.parse(
    await readFile(path.join(projectDir, 'selected-concept.json'), 'utf-8')
  ) as { concept: Concept };
  const formatPack = getFormatPack(project.format);
  const systemPrompt = await readFile(
    path.join(process.cwd(), 'src', 'core', 'prompts', 'scriptwriter.md'),
    'utf-8'
  );

  const claimsPayload = verifiedClaims.map((c) => ({
    id: c.id,
    text: c.text,
    value: c.value,
    unit: c.unit,
    kind: c.kind,
    quote: c.sources[0]?.quote ?? '',
  }));

  const basePrompt = `Topik: "${project.topic}"
Format: ${formatPack.id} (${formatPack.name})
Struktur format:
${formatPack.structure.join('\n')}
Aturan fakta format:
${formatPack.fact_rules.join('\n')}

Konsep terpilih:
${JSON.stringify(selectedRaw.concept, null, 2)}

Klaim TERVERIFIKASI (hanya boleh merujuk ID di bawah ini):
${JSON.stringify(claimsPayload, null, 2)}

Target durasi: ${project.target_duration_sec} detik.`;

  let s3Calls = 0;
  let s4Calls = 0;
  try {
    const genRes = await generateJson(ScriptSchema, basePrompt, {
      stage: 'S3',
      systemInstruction: systemPrompt,
      onCallRecord: () => {
        s3Calls++;
      },
    });
    let script = genRes.data;

    await incrementProjectLlmCalls(projectId, 'S3', s3Calls, repoRoot);
    s3Calls = 0;
    const afterS3 = await loadProject(projectId, repoRoot);
    afterS3.stages.S3 = 'done';
    afterS3.stages.S4 = 'running';
    await saveProject(afterS3, repoRoot);

    const l2Before = verifyScriptL2(script, ledger);
    const l3Before = await verifyScriptL3(script, ledger, {
      onCall: () => {
        s4Calls++;
      },
    });

    let l2Final = l2Before;
    let l3Final = l3Before;
    let rewritten = false;

    const allBeforeErrors = [
      ...l2Before.issues.filter((i) => i.severity === 'error'),
      ...l3Before.issues.filter((i) => i.severity === 'error'),
    ];

    if (allBeforeErrors.length > 0) {
      rewritten = true;
      const fixPrompt = `${basePrompt}

Naskah sebelumnya memiliki isu QC berikut yang WAJIB diperbaiki:
${allBeforeErrors.map((e) => `- [${e.ref}] ${e.message}`).join('\n')}

Naskah sebelumnya:
${JSON.stringify(script, null, 2)}

Tulis ulang naskah dengan memperbaiki seluruh isu di atas. Pastikan angka & klaim persis sama dengan klaim verified.`;

      const rewriteRes = await generateJson(ScriptSchema, fixPrompt, {
        stage: 'S3',
        systemInstruction: systemPrompt,
        onCallRecord: () => {
          s3Calls++;
        },
      });
      script = rewriteRes.data;

      l2Final = verifyScriptL2(script, ledger);
      l3Final = await verifyScriptL3(script, ledger, {
        onCall: () => {
          s4Calls++;
        },
      });
    }

    const qcDir = path.join(projectDir, 'qc');
    await mkdir(qcDir, { recursive: true });
    await writeFile(path.join(projectDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');
    await writeFile(path.join(qcDir, 'L2.json'), JSON.stringify(l2Final, null, 2), 'utf-8');
    await writeFile(path.join(qcDir, 'L3.json'), JSON.stringify(l3Final, null, 2), 'utf-8');

    if (s3Calls > 0) await incrementProjectLlmCalls(projectId, 'S3', s3Calls, repoRoot);
    if (s4Calls > 0) await incrementProjectLlmCalls(projectId, 'S4', s4Calls, repoRoot);

    const hasRemainingErrors =
      l2Final.issues.some((i) => i.severity === 'error') ||
      l3Final.issues.some((i) => i.severity === 'error');
    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S4 = hasRemainingErrors ? 'needs_review' : 'done';
    await saveProject(updated, repoRoot);

    return { script, l2Before, l3Before, l2Final, l3Final, rewritten };
  } catch (err) {
    if (s3Calls > 0) await incrementProjectLlmCalls(projectId, 'S3', s3Calls, repoRoot).catch(() => {});
    if (s4Calls > 0) await incrementProjectLlmCalls(projectId, 'S4', s4Calls, repoRoot).catch(() => {});
    const failed = await loadProject(projectId, repoRoot);
    if (failed.stages.S3 === 'running') failed.stages.S3 = 'failed';
    if (failed.stages.S4 === 'running') failed.stages.S4 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
