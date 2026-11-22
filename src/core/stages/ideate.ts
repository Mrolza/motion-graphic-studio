import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { generateJson } from '@core/llm/client';
import { detectTopicDomain } from '@core/kit/domain-registry';
import {
  getProjectDir,
  incrementProjectLlmCalls,
  loadProject,
  saveProject,
} from '@core/project/store';

export const ConceptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  angle: z.string().min(1),
  hook: z.string().min(1),
  domain: z.enum(['rail', 'engine', 'generic']).optional(),
  core_claims: z.array(z.string().min(1)).min(3).max(5),
  key_steps: z.array(z.string().min(1)).optional(),
  wiki_titles: z
    .object({
      en: z.array(z.string().min(1)).max(5),
      id: z.array(z.string().min(1)).max(5),
    })
    .optional(),
  search_queries: z.array(z.string().min(1)).min(2).max(6),
});

export const ConceptsOutputSchema = z.object({
  concepts: z.array(ConceptSchema).length(3),
});

export type Concept = z.infer<typeof ConceptSchema>;
export type ConceptsOutput = z.infer<typeof ConceptsOutputSchema>;

export async function runIdeateStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<ConceptsOutput> {
  const project = await loadProject(projectId, repoRoot);
  project.stages.S1 = 'running';
  await saveProject(project, repoRoot);

  const systemInstruction = `Anda adalah perancang konsep video pendek edukasi berbasis fakta.
Buat tepat 3 konsep berbeda untuk topik dan format yang diberikan.
Aturan ketat:
- Hindari mitos populer dan klaim yang tidak bisa diverifikasi di Wikipedia.
- Setiap konsep wajib memiliki 3-5 core_claims faktual yang konkret dan dapat diverifikasi.
- Untuk format what_if, premis boleh hipotetis tetapi core_claims HARUS fakta ilmiah nyata yang mendasari skenario tersebut.
- Untuk format today_in_history, fokuskan core_claims (3-4 klaim) pada fakta utama kejadian (tanggal, tahun, tokoh kunci, peristiwa inti, dan hasilnya) yang ada di bagian awal/ringkasan artikel utama Wikipedia kejadian tersebut.
- wiki_titles wajib berisi judul artikel Wikipedia berbahasa Inggris ("en", 2-5 judul) dan Indonesia ("id", 1-3 judul) yang paling tepat menjawab pertanyaan topik (misalnya untuk kereta: "Wheelset (rail transport)", "Flange", "Track gauge", "Hunting oscillation", "Derailment").
- search_queries wajib berisi kata kunci pencarian Wikipedia cadangan (2-6 query).
- Untuk topik proses ("cara kerja", "bagaimana dibuat", format how_it_works/how_its_made), WAJIB isi "key_steps" berisi daftar urutan langkah utama (mis. ["Hisap", "Kompresi", "Usaha", "Buang"] untuk mesin 4 tak).
- WAJIB isi "domain": "rail" (untuk topik kereta/rel/flens), "engine" (untuk topik mesin/piston/silinder/4 tak), atau "generic" (lainnya).
- Kembalikan JSON sesuai skema: { "concepts": [{ "id": "C1", "title": "...", "angle": "...", "hook": "...", "domain": "rail|engine|generic", "core_claims": ["..."], "key_steps": ["..."], "wiki_titles": { "en": ["..."], "id": ["..."] }, "search_queries": ["..."] }] }.`;

  const prompt = `Topik: "${project.topic}"
Format: ${project.format}
Target durasi: ${project.target_duration_sec} detik

Hasilkan 3 konsep.`;

  let llmCallsThisRun = 0;
  const projectDir = getProjectDir(projectId, repoRoot);
  try {
    const res = await generateJson(ConceptsOutputSchema, prompt, {
      stage: 'S1',
      purpose: 'ideate',
      projectDir,
      systemInstruction,
      onCallRecord: () => {
        llmCallsThisRun++;
      },
    });

    const normalized = {
      concepts: res.data.concepts.map((c) => ({
        ...c,
        domain: c.domain ?? detectTopicDomain(project.topic),
      })),
    };

    const outPath = path.join(projectDir, 'concepts.json');
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(normalized, null, 2), 'utf-8');

    await incrementProjectLlmCalls(projectId, 'S1', llmCallsThisRun, repoRoot);
    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S1 = 'done';
    await saveProject(updated, repoRoot);
    return normalized;
  } catch (err) {
    if (llmCallsThisRun > 0) {
      await incrementProjectLlmCalls(projectId, 'S1', llmCallsThisRun, repoRoot).catch(() => {});
    }
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S1 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
