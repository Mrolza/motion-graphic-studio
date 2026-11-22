import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema, type Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { generateJson } from '@core/llm/client';
import { computeStableHash, type RunLlmTracker } from '@core/llm/budget';
import {
  detectTopicDomain,
  getAvailableShotsForDomain,
  type KitDomain,
} from '@core/kit/domain-registry';
import { getProjectDir, incrementProjectLlmCalls, loadProject, saveProject } from '@core/project/store';
import { QC_RULES_VERSION } from '@core/qc/rules-version';

const ASSEMBLY_DOCS_BY_DOMAIN: Record<KitDomain, string[]> = {
  rail: [
    `- TrainCar: { entityId?: 'train_car', distance?: number, curveStartZ?: number, curveRadius?: number, palette?: 'blueprint-navy' } (domain: rail; untuk shot establishing kereta utuh)`,
    `- WheelsetOnRail: { entityId?: 'wheelset', distance?: number, lateralShift?: number, wheelRadius?: number, gauge?: number, coneRatio?: number, taperExaggeration?: number, curveStartZ?: number, curveRadius?: number, highlightContact?: boolean, showEffectiveDiameter?: boolean, palette?: 'blueprint-navy' } (domain: rail)`,
    `- RailCrossSection: { entityId?: 'rail_cross_section', lateralShift?: number, gauge?: number, taperExaggeration?: number, palette?: 'blueprint-navy' } (domain: rail; untuk shot cross_section tapak kerucut & flens)`,
    `- CurvedRail: { startZ?: number, curveStartZ?: number, curveRadius?: number, curveLength?: number, gauge?: number, highlighted?: boolean, palette?: 'blueprint-navy' } (domain: rail)`,
  ],
  engine: [
    `- EngineBlock: { entityId?: 'engine_block', crankAngleDeg: number, cutawayProgress?: number, position?: [x,y,z], palette?: 'blueprint-navy' } (domain: engine; untuk shot establishing / cutaway blok mesin)`,
    `- PistonCrankAssembly: { entityId?: 'piston_crank', crankAngleDeg: number, position?: [x,y,z], cutaway?: boolean, palette?: 'blueprint-navy' } (domain: engine)`,
    `- CylinderSection: { entityId?: 'cylinder_section', view?: 'section', crankAngleDeg: number, position?: [x,y,z], palette?: 'blueprint-navy' } (domain: engine; untuk shot cross_section irisan silinder, katup masuk/buang, ruang bakar)`,
  ],
  generic: [
    `- Suspension: { entityId?: 'suspension', position?: [x,y,z], phaseRad?: number, restLength?: number, amplitude?: number, palette?: 'blueprint-navy' } (domain: generic)`,
  ],
};

export function buildKitSummaryForDomain(domain: KitDomain): string {
  const assemblies = [
    ...(domain !== 'generic' ? ASSEMBLY_DOCS_BY_DOMAIN[domain] : []),
    ...ASSEMBLY_DOCS_BY_DOMAIN.generic,
  ].join('\n');

  const overlayLine =
    domain === 'rail'
      ? `- Overlay 2D (taruh di dalam <HudLayout>, BUKAN di children 3D <BlueprintStage>): RailCurveOverlay ({ curveArc?: boolean, inertiaArrow?: boolean, palette? }), DiagramOverlay ({ axisGuides?: boolean, highlightRing?: boolean, gridGuide?: boolean, palette? })`
      : `- Overlay 2D (taruh di dalam <HudLayout>, BUKAN di children 3D <BlueprintStage>): DiagramOverlay ({ axisGuides?: boolean, highlightRing?: boolean, gridGuide?: boolean, palette? })`;

  const hudCompareLine =
    domain === 'rail'
      ? `, EffectiveDiameterCompare (untuk shot_type="comparison" pada wheelset/rail_cross_section: { outerLabel?, innerLabel?, bind_to_driver?: true, display: 'qualitative' })`
      : '';

  return `Scene Kit API (remotion/src/kit/, domain="${domain}"):
- Stage & Camera:
  - BlueprintStage: { palette?: 'blueprint-navy', telemetry?: boolean, hud?: ReactNode, children: ReactNode (HANYA objek 3D, JANGAN taruh HUD di children!) }
  - CameraRig: { mode: 'frameEntities' | 'dolly' | 'orbit', framing?: 'portrait-lower', focusBox?: { center: [x,y,z], size: [w,h,d] }, padding?: number, startAngleDeg?: number, endAngleDeg?: number, durationSec?: number, elevationDeg?: number }
- Rakitan 3D (domain "${domain}" + generic):
${assemblies}
- Primitif 3D: Ground, Rail, Arrow3D, MotionArrow ({ id?, bindToPart?, position?, length?, velocity?, direction?, palette? }), Line3D, Label3D, Box, Cylinder, Sphere, Torus, Cone, Group
${overlayLine}
- Driver: useDriver({ name, from, to, unit, startSec, durationSec, curve }) -> { name, value, unit, progress }; valveStateFromCrankAngle(deg)
- HUD (DIKENDALIKAN DATA STORYBOARD lewat <StoryboardHudProvider items={hudData}> dan <Hud id="..." driver={driver} palette="blueprint-navy" />; DILARANG menulis teks HUD langsung di kode adegan!):
  - Komponen di storyboard hud[]: KineticTitle, Callout, MeasureReveal, StatCounter (wajib bind_to_driver: true; gunakan illustrative: true jika quantity="progress"), CompareCard, ListReveal, DimensionLine${hudCompareLine}
  - Satuan sudut WAJIB "°" (jangan "deg") atau biarkan StatCounter memformat unit driver ("°").
- Foreground & Transisi: ParallaxForeground ({ distance, zOffset, palette }), SceneTransition ({ variant: 'fade'|'wipe-grid', durationSec, palette, children })`;
}

export const KIT_SUMMARY_FOR_LLM = buildKitSummaryForDomain('generic');

export async function runStoryboardStage(
  projectId: string,
  repoRoot = process.cwd(),
  options?: { tracker?: RunLlmTracker; generateJsonFn?: typeof generateJson }
): Promise<Storyboard> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  const llm = options?.generateJsonFn ?? generateJson;

  let llmCalls = 0;
  try {
    const script = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
    const timeline = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
    const ledger = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
    const verifiedClaims = ledger.claims.filter((c) => c.status === 'verified');
    let domain: KitDomain = detectTopicDomain(project.topic);
    try {
      const sel = JSON.parse(await readFile(path.join(projectDir, 'selected-concept.json'), 'utf-8')) as {
        concept?: { domain?: KitDomain };
      };
      if (sel.concept?.domain) domain = sel.concept.domain;
    } catch {
      // fallback to detectTopicDomain
    }
    const availableShots = getAvailableShotsForDomain(domain);
    const kitApi = await readFile(path.join(repoRoot, 'remotion', 'src', 'kit', 'KIT-API.md'), 'utf-8').catch(() => '');
    const inputHash = computeStableHash({
      script,
      sceneIds: timeline.scenes.map((s) => s.scene_id),
      ledger,
      kitApi,
      domain,
      rulesVersion: QC_RULES_VERSION,
      promptVersion: 'p4f-v1',
    });

    if (project.stages.S7 === 'done') {
      try {
        const meta = JSON.parse(await readFile(path.join(projectDir, 'storyboard.meta.json'), 'utf-8')) as {
          inputHash?: string;
        };
        if (meta.inputHash === inputHash) {
          const cached = StoryboardSchema.parse(
            JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8'))
          );
          return cached;
        }
      } catch {
        // Cache miss
      }
    }

    project.stages.S6 = 'running';
    await saveProject(project, repoRoot);

    const sceneDurations = timeline.scenes.map((s) => ({
      scene_id: s.scene_id,
      duration_sec: Number((s.end - s.start).toFixed(3)),
    }));

    const crossSectionRule =
      domain === 'engine'
        ? `- shot_type="cross_section" WAJIB memakai "cylinder_section" dan "view": "section" (untuk adegan langkah hisap/kompresi).`
        : domain === 'rail'
        ? `- shot_type="cross_section" WAJIB memakai "rail_cross_section" dan "view": "section".\n   - shot_type="comparison" pada wheelset/rail_cross_section WAJIB menyertakan HUD "EffectiveDiameterCompare" di hud[].`
        : '';

    const establishingEntity = domain === 'engine' ? 'engine_block' : domain === 'rail' ? 'train_car' : 'suspension';
    const allowedEntitiesHint =
      domain === 'engine'
        ? `engine_block: ["block"]; piston_crank: ["piston","crank","intake_valve","exhaust_valve","spark_plug"]; cylinder_section: ["piston","crank","conrod","intake_valve","exhaust_valve","spark_plug","combustion_chamber"]`
        : domain === 'rail'
        ? `train_car: ["body"]; rail_cross_section: ["wheel_left","wheel_right","flange"]; wheelset: ["wheel_left","wheel_right","flange"]`
        : `suspension: ["spring","damper"]`;

    const systemInstruction = `Anda adalah Direktur Visual & Storyboarder untuk video edukasi 3D vertikal 9:16 (gaya Blueprint).
Tugas: buat storyboard terstruktur (JSON) untuk setiap adegan naskah menggunakan Scene Kit untuk domain "${domain}".

ATURAN WAJIB:
1. Buat tepat 1 adegan storyboard untuk setiap adegan di "script.scenes" dengan "id" dan "duration_sec" SAMA PERSIS dengan timeline.
2. Semua adegan memakai "lane": "code_3d", serta WAJIB mengisi "shot_type" (pilih HANYA dari: ${availableShots.map((s) => `"${s}"`).join(', ')}) dan "camera_move" (mis. "dolly_in", "orbit_curve", "static_cross_section").
   - Adegan 1 sebaiknya "establishing" (${establishingEntity}).
   - Minimal ${Math.min(3, availableShots.length)} jenis shot_type berbeda dalam satu video; dua adegan berurutan TIDAK BOLEH memakai shot_type dan focus_entities yang sama!
3. "sentence_refs" berisi ID kalimat adegan itu (mis. ["S1.1", "S1.2"]).
4. "focus_entities" dan "visible_parts" WAJIB tidak kosong dan HANYA memakai entitas domain "${domain}" (${allowedEntitiesHint}). DILARANG memakai entitas domain lain!
   - shot_type="establishing" WAJIB memakai "${establishingEntity}".
   ${crossSectionRule}
5. "driver": tentukan satu penggerak fisik utama per adegan (untuk sudut gunakan unit "°", bukan "deg").
6. "invariants": jika ada mekanisme berstatus (intake_valve, exhaust_valve, spark), deklarasikan invarian dengan rentang "driver_between" DI DALAM [from, to] driver adegan itu.
7. "hud": MAKSIMAL 2 item HUD per adegan (di luar judul). Setiap item WAJIB memiliki "hud_id" unik (mis. "S1_H1", "S1_H2").
   - Untuk penjelasan langkah mesin (hisap/kompresi/usaha/buang), WAJIB sertakan "when": { "driver_between": [a, b] } agar teks hanya muncul pada rentang sudut langkahnya!
   - Setiap item HUD (termasuk KineticTitle/Callout) yang memuat angka atau fakta WAJIB mengisi "claim_ref" ke salah satu ID klaim verified (format "C1", "C2", ..., BUKAN ID kalimat "S1.1"/"S2.1"!) atau "bind_to_driver": true untuk StatCounter, atau "illustrative": true.
   - Jika "bind_to_driver": true (atau StatCounter): WAJIB isi "quantity" (salah satu dari "crank_angle", "lateral_shift", "distance", "effective_diameter", "progress") dan "display" ("value" | "qualitative"). Label WAJIB menyebut istilah besaran (mis. "Sudut Poros Engkol" untuk crank_angle, "Geser Lateral" untuk lateral_shift, "Diameter Efektif" untuk effective_diameter). Gunakan display="value" HANYA jika rentang angkanya didukung claim_ref; jika tidak ada dukungan angka di klaim, WAJIB display="qualitative" tanpa angka!
   - KEBENARAN MAKNA (L5 semantik): JANGAN melebih-lebihkan klaim ("less chance" jangan ditulis "tanpa", jangan tambah kata "Kontinu"/"selalu"/"semua" jika tidak ada di kutipan), dan JANGAN hilangkan syarat ("tanpa bentuk kerucut", "cenderung"). Judul ilustratif harus persis menjawab topik "${project.topic}".
   - HUD RINGKAS: Callout MAKSIMAL 8 kata dan 2 baris (kalimat lengkap cukup di narasi & takarir).
   - Setiap angka pada teks HUD WAJIB cocok dengan klaim rujukan dan berformat id-ID (jangan bocorkan "(C1)"/"(C2)" di teks HUD, jangan pakai "deg" — gunakan "°").
8. "trigger_words": pilih 1-2 kata KUNCI yang BENAR-BENAR ADA persis di kalimat narasi adegan itu untuk memicu gerak utama.

${buildKitSummaryForDomain(domain)}`;

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
      "shot_type": "establishing",
      "camera_move": "dolly_along_track",
      "duration_sec": 4.5,
      "sentence_refs": ["S1.1"],
      "focus_entities": ["train_car"],
      "visible_parts": ["body"],
      "driver": { "name": "distance", "unit": "m", "from": -2, "to": 2 },
      "invariants": [{ "entity": "wheelset", "state": "flanges_inside=true", "when": { "driver_between": [-2, 2] } }],
      "hud": [
        { "hud_id": "S1_H1", "component": "MeasureReveal", "props": { "label": "Kemiringan", "valueText": "1:20" }, "claim_ref": "C1" },
        { "hud_id": "S1_H2", "component": "StatCounter", "props": { "label": "Geser Lateral" }, "bind_to_driver": true, "quantity": "lateral_shift", "display": "qualitative", "claim_ref": "C2" }
      ],
      "trigger_words": ["kerucut"]
    }
  ]
}`;

    const res = await llm(StoryboardSchema, prompt, {
      stage: 'S6',
      purpose: 'storyboard',
      tracker: options?.tracker,
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
    await writeFile(
      path.join(projectDir, 'storyboard.meta.json'),
      JSON.stringify({ inputHash }, null, 2),
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
