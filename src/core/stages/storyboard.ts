import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema, type Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { generateJson } from '@core/llm/client';
import { getProjectDir, incrementProjectLlmCalls, loadProject, saveProject } from '@core/project/store';

export const KIT_SUMMARY_FOR_LLM = `Scene Kit API (remotion/src/kit/):
- Stage & Camera:
  - BlueprintStage: { palette?: 'blueprint-navy', telemetry?: boolean, hud?: ReactNode, children: ReactNode (HANYA objek 3D, JANGAN taruh HUD di children!) }
  - CameraRig: { mode: 'frameEntities' | 'dolly' | 'orbit', framing?: 'portrait-lower', focusBox?: { center: [x,y,z], size: [w,h,d] }, padding?: number, startAngleDeg?: number, endAngleDeg?: number, durationSec?: number, elevationDeg?: number }
- Rakitan 3D (wajib untuk mekanisme kereta/mesin):
  - WheelsetOnRail: { entityId?: 'wheelset', distance?: number, lateralShift?: number, wheelRadius?: number, gauge?: number, coneRatio?: number, taperExaggeration?: number, curveStartZ?: number, curveRadius?: number, highlightContact?: boolean, showEffectiveDiameter?: boolean, palette?: 'blueprint-navy' }
  - CurvedRail: { startZ?: number, curveStartZ?: number, curveRadius?: number, curveLength?: number, gauge?: number, highlighted?: boolean, palette?: 'blueprint-navy' }
  - PistonCrankAssembly: { entityId?: 'piston_crank', crankAngleDeg: number, position?: [x,y,z], cutaway?: boolean, palette?: 'blueprint-navy' }
  - Suspension: { entityId?: 'suspension', position?: [x,y,z], phaseRad?: number, restLength?: number, amplitude?: number, palette?: 'blueprint-navy' }
- Primitif 3D: Ground ({ size, divisions, y }), Rail, Arrow3D ({ from, to, radius, headRadius, headLength, palette }), Line3D, Label3D, Box, Cylinder, Sphere, Torus, Cone, Group
- Driver: useDriver({ name, from, to, unit, startSec, durationSec, curve }) -> { name, value, unit, progress }; valveStateFromCrankAngle(deg) -> { strokePhase, intakeOpen, exhaustOpen, sparkOn }
- HUD (WAJIB di prop hud={...} BlueprintStage; JANGAN pakai children pada Callout/MeasureReveal!):
  - HudLayout ({ palette, children }) & HudZone ({ zone: 'title'|'callout', palette, children })
  - KineticTitle: { id?, title: string, subtitle?: string, palette? }
  - Callout: { id?, label: string, detail?: string, claimRef?: string, palette? }  <-- TIDAK ADA children, TIDAK ADA title/content!
  - MeasureReveal: { id?, label: string, valueText: string, startSec?, durationSec?, claimRef?, palette? }
  - StatCounter: { id?, label: string, driver?: DriverValue, bindToDriver?: boolean, decimals?, unit?, claimRef?, palette? }
  - CompareCard: { id?, leftTitle: string, leftValue: string, rightTitle: string, rightValue: string, palette? }
  - ListReveal: { id?, items: string[], activeIndex?: number, palette? }
- Foreground & Transisi: ParallaxForeground ({ distance, zOffset, palette }), SceneTransition ({ variant: 'fade'|'wipe-grid', durationSec, palette, children })`;

export async function runStoryboardStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<Storyboard> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  project.stages.S6 = 'running';
  await saveProject(project, repoRoot);

  let llmCalls = 0;
  try {
    const script = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
    const timeline = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
    const ledger = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
    const verifiedClaims = ledger.claims.filter((c) => c.status === 'verified');

    const sceneDurations = timeline.scenes.map((s) => ({
      scene_id: s.scene_id,
      duration_sec: Number((s.end - s.start).toFixed(3)),
    }));

    const systemInstruction = `Anda adalah Direktur Visual & Storyboarder untuk video edukasi 3D vertikal 9:16 (gaya Blueprint).
Tugas: buat storyboard terstruktur (JSON) untuk setiap adegan naskah menggunakan Scene Kit.

ATURAN WAJIB:
1. Buat tepat 1 adegan storyboard untuk setiap adegan di "script.scenes" dengan "id" dan "duration_sec" SAMA PERSIS dengan timeline.
2. Semua adegan memakai "lane": "code_3d".
3. "sentence_refs" berisi ID kalimat adegan itu (mis. ["S1.1", "S1.2"]).
4. "focus_entities" dan "visible_parts" WAJIB tidak kosong (contoh kereta: focus_entities=["wheelset"], visible_parts=["wheel_left","wheel_right","flange"]; contoh mesin: focus_entities=["piston_crank"], visible_parts=["piston","crank","intake_valve","exhaust_valve","spark_plug"]).
5. "driver": tentukan satu penggerak fisik utama per adegan (mis. { "name": "distance", "unit": "m", "from": -4, "to": 4 } atau { "name": "crank_angle", "unit": "deg", "from": 0, "to": 180 }).
6. "invariants": jika ada mekanisme berstatus (mis. intake_valve, exhaust_valve, spark), deklarasikan invarian dengan rentang "driver_between" yang berada DI DALAM [from, to] driver adegan itu.
7. "hud": MAKSIMAL 2 item HUD per adegan (di luar judul). Gunakan komponen Scene Kit (MeasureReveal untuk ukuran/rasio tetap, StatCounter jika bind_to_driver=true, Callout, CompareCard, ListReveal).
   - Setiap item HUD (termasuk KineticTitle/Callout) yang memuat angka atau fakta (mis. "4 Tak", "2 putaran", "1:20") WAJIB mengisi "claim_ref" ke salah satu ID klaim verified (atau "bind_to_driver": true untuk StatCounter, atau "illustrative": true). Untuk StatCounter yang mengikuti driver adegan, WAJIB isi "bind_to_driver": true.
   - Setiap angka pada teks HUD WAJIB cocok dengan klaim rujukan dan berformat id-ID (pemisah ribuan titik, desimal koma; JANGAN bocorkan "(C1)"/"(C2)" di teks HUD).
8. "trigger_words": pilih 1-2 kata KUNCI yang BENAR-BENAR ADA persis di kalimat narasi adegan itu untuk memicu gerak utama.

${KIT_SUMMARY_FOR_LLM}`;

    const prompt = `Topik: "${project.topic}"
Palet: ${project.style} (blueprint-navy)

Durasi per adegan dari timeline:
${JSON.stringify(sceneDurations, null, 2)}

Naskah:
${JSON.stringify(script, null, 2)}

Klaim verified di Fact Ledger:
${JSON.stringify(
  verifiedClaims.map((c) => ({ id: c.id, text: c.text, value: c.value, unit: c.unit })),
  null,
  2
)}

Kembalikan JSON PERSIS mengikuti contoh struktur berikut (jangan ubah nama field):
{
  "scenes": [
    {
      "id": "S1",
      "lane": "code_3d",
      "duration_sec": 4.5,
      "sentence_refs": ["S1.1"],
      "focus_entities": ["wheelset"],
      "visible_parts": ["wheel_left", "wheel_right", "flange"],
      "driver": { "name": "distance", "unit": "m", "from": -2, "to": 2 },
      "invariants": [{ "entity": "wheelset", "state": "on_rail=true", "when": { "driver_between": [-2, 2] } }],
      "hud": [{ "component": "MeasureReveal", "props": { "label": "Kemiringan", "valueText": "1:20" }, "claim_ref": "C1" }],
      "trigger_words": ["kerucut"]
    }
  ]
}`;

    const res = await generateJson(StoryboardSchema, prompt, {
      stage: 'S6',
      systemInstruction,
      onCallRecord: () => {
        llmCalls++;
      },
    });

    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'storyboard.json'),
      JSON.stringify(res.data, null, 2),
      'utf-8'
    );

    if (llmCalls > 0) await incrementProjectLlmCalls(projectId, 'S6', llmCalls, repoRoot);
    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S6 = 'done';
    await saveProject(updated, repoRoot);
    return res.data;
  } catch (err) {
    if (llmCalls > 0) await incrementProjectLlmCalls(projectId, 'S6', llmCalls, repoRoot).catch(() => {});
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S6 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
