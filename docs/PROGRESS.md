# Progress — Motion-Graphic Studio

## Fase P0 — Spike (`docs/SPIKE-1.md`)

- **Status:** **DONE**
- **Branch:** `phase/p0-spike` (tag awal: `p0-start`)
- **Tanggal:** 2026-11-18

### Apa yang Dibuat
1. **Persiapan repo:** `git init` dengan `main`, push ke `origin` (`Mrolza/motion-graphic-studio`), branch `phase/p0-spike` dan tag `p0-start`.
2. **Proyek Remotion minimal (`spike/`):** Remotion `4.0.545`, `@remotion/three` `4.0.545`, `three` `0.187.0`, `@react-three/fiber` `9.8.2`, `@google/genai` `1.52.0`.
3. **Scene Kit mini (`spike/src/kit/`):**
   - Token gaya Blueprint (`tokens.ts`), helper gerak berbasis detik (`motion.ts`: `spin`, `translatePath`, `oscillate`, `highlight`), `BlueprintStage.tsx`, `CameraRig.tsx` (`dolly`, `orbit`, `closeUp` + easing).
   - Primitif 3D (`Primitives3D.tsx`, `TrainCar.tsx`): `Ground`, `Rail`, `Wheel` (dengan flens), `Axle`, `TrainCar`, `Pole`, `Spring`.
   - HUD 2D (`Hud2D.tsx`): `TitleCard`, `StatCounter`, `DimensionLine`, `Callout`, `CaptionBar`.
4. **Benchmark render (`spike/scripts/benchmark-render.ts`):** uji `gl: "angle"` vs `gl: "swangle"` pada concurrency 1, 2, 4 (6 detik, 720×1280, 30 fps).
5. **Gemini Scene Coder (`spike/prompts/scene-coder.md`, `spike/scripts/validator.ts`, `spike/scripts/run-scene-coder.ts`):** 4 spesifikasi adegan topik *"Kenapa kereta tidak tergelincir?"* digenerate oleh `gemini-3.5-flash-lite`, divalidasi (whitelist import, larangan API berbahaya, `tsc --noEmit`), dan dirender still tengah.
6. **Video gabungan (`spike/scripts/render-spike.ts`):** menggabungkan 4 adegan dengan transisi cross-fade menjadi `out/review/p0/spike.mp4` (24.20 detik) + 12 still (awal, tengah, akhir).

### Bukti (`out/review/p0/`)
- Video gabungan: [`out/review/p0/spike.mp4`](../out/review/p0/spike.mp4)
- Still (12 still + 4 still cek tengah): [`out/review/p0/stills/`](../out/review/p0/stills/)
- Kode adegan Gemini (`.raw.tsx` & `.final.tsx`): [`out/review/p0/scenes/`](../out/review/p0/scenes/)
- Metrik & hasil benchmark: [`out/review/p0/metrics.md`](../out/review/p0/metrics.md)

### Hasil Kriteria Lolos
1. Low-poly 3D berhasil dirender dengan `angle` (7.1–19.0 detik) dan `swangle` (17.0–21.4 detik), 98.56% identik secara visual. **LULUS**
2. 4 dari 4 adegan ditulis Gemini dan lolos validator pada percobaan pertama (0 perbaikan). **LULUS**
3. Tidak ada frame kosong/hitam di `spike.mp4` (12/12 still lolos deteksi `isBlank = false`). **LULUS**
4. Visual menunjukkan gerak objek nyata (`TrainCar` melaju, `Wheel`/`Axle` berputar, `Spring` berosilasi, `StatCounter` naik 1.249 → 1.435 mm, `DimensionLine` menggambar garis ukur). **LULUS**

### Catatan untuk Pemilik
- Opsi Remotion `hardwareAcceleration: "if-possible"` memicu `Error: write EOF` di Windows; benchmark dan render menggunakan `hardwareAcceleration: "disable"` (CPU x264) dan berjalan stabil.
- Ditemukan z-fighting ringan pada bidang koplanar flens roda (`Wheel`); mudah diperbaiki di fase P3 dengan offset `0.002`.
- `tsc --noEmit` di `spike/` lulus 0 error.

---

## Fase P0b — Uji Generalisasi (`docs/SPIKE-2.md`)

- **Status:** **DONE** (menunggu penilaian visual pemilik/Claude atas still & `spike2.mp4` di review)
- **Branch:** `phase/p0b-generalize` (tag awal: `p0b-start`)
- **Tanggal:** 2026-11-18

### Apa yang Dibuat
1. **Perbaikan dari `REVIEW-P0.md`:**
   - Format angka `id-ID` (`Intl.NumberFormat('id-ID')`) di `Hud2D.tsx` (`StatCounter`).
   - Ukuran teks minimum di lebar 720: `TitleCard` 46 px (≥ 44 px), `CaptionBar` 32 px (≥ 32 px), `Callout` 26 px (≥ 26 px).
   - Preset framing kamera 9:16 (`portrait-lower`, `portrait-center`, `portrait-closeup`) di `CameraRig.tsx`, sekaligus perbaikan sinkronisasi `camera.lookAt()` sebelum frame digambar.
   - Perbaikan z-fighting flens roda (`+0.002` offset) di `Primitives3D.tsx`.
   - Commit folder `.agents/` beserta skill ke repo.
2. **Scene Kit Primitif Umum (`spike/src/kit/`):**
   - `GeneralPrimitives3D.tsx`: `Box`, `Cylinder` (dengan `openEnded`, `thetaStart`, `thetaLength` untuk cutaway), `Sphere`, `Torus`, `Cone`, `Group`, `Grid`, dan `cutaway`/`opacity`.
   - `linkage.ts`: `solveCrankSlider()` dan `crankAngleFromTime()` untuk kinematika engkol-batang-piston eksak.
3. **Pipeline & Validator P0b (`spike/prompts/scene-coder-p0b.md`, `validator-p0b.ts`, `run-scene-coder-p0b.ts`, `render-spike-p0b.ts`):**
   - Melarang komponen kereta (`Rail`, `Wheel`, `Axle`, `TrainCar`, `Pole`, `Spring`) dan JSX Three.js mentah; mewajibkan `solveCrankSlider()`.
   - 4 adegan topik *"Bagaimana mesin 4 tak bekerja?"* digenerate oleh `gemini-3.5-flash-lite` dan lolos 4/4 setelah 1 kali retry pemadatan baris (≤ 220 baris).

### Bukti (`out/review/p0b/`)
- Video gabungan: [`out/review/p0b/spike2.mp4`](../out/review/p0b/spike2.mp4) (24.20 detik / 726 frame @ 30 fps, dirender 37.1 detik)
- Still (12 still + 4 still cek tengah): [`out/review/p0b/stills/`](../out/review/p0b/stills/)
- Kode adegan Gemini (`.raw.tsx` & `.final.tsx`): [`out/review/p0b/scenes/`](../out/review/p0b/scenes/)
- Verifikasi mekanik & katup: [`out/review/p0b/mechanics-check.md`](../out/review/p0b/mechanics-check.md)
- Metrik & temuan: [`out/review/p0b/metrics.md`](../out/review/p0b/metrics.md)

### Hasil Kriteria Lolos
1. 4 dari 4 adegan lolos validator (1 perbaikan per adegan untuk batas baris). **LULUS**
2. Objek mesin 4 tak (blok silinder cutaway, piston + ring, batang penghubung, poros engkol, katup hisap/buang, busi) terlihat jelas dan dapat dikenali pada still. **LULUS** (menunggu konfirmasi review pemilik/Claude)
3. Gerak mekanis sinkron lewat `solveCrankSlider` dan urutan katup/busi sesuai 0°–720° (tercatat di `mechanics-check.md`). **LULUS**
4. 12/12 still tidak kosong (`isBlank = false`); angka HUD (`5.375 RPM`) berformat `id-ID`. **LULUS**

### Catatan untuk Pemilik
- `tsc --noEmit` di `spike/` lulus 0 error.
- Temuan kecil: pada `Scene1` dan `Scene3`, posisi `Callout` dari Gemini bertumpuk dengan `StatCounter` `top-right`; di P3 perlu pengecekan anti-overlap antar-HUD.

---

## Fase P1 — Fondasi (`docs/P1-FOUNDATION.md`)

- **Status:** **DONE**
- **Branch:** `phase/p1-foundation` (tag awal: `p1-start`; spike P0+P0b sudah di-merge ke `main` dengan tag `p0-done`)
- **Tanggal:** 2026-11-18

### Apa yang Dibuat
1. **Merge spike & struktur repo:**
   - `phase/p0b-generalize` di-merge (`--no-ff`) ke `main` dengan tag `p0-done`, lalu dibuat branch `phase/p1-foundation` (`p1-start`).
   - `spike/src/kit/` dipindahkan ke `remotion/src/kit/` via `git mv`; sisa `spike/` dipindahkan ke `archive/spike/`.
   - Package utama (`/`) dan `remotion/` masing-masing memiliki `package.json` dan `tsconfig.json` terpisah (`tsc --noEmit` 0 error di keduanya).
2. **Salinan modul dari `D:\content-studio`:**
   - `tts.ts`, `audio-mix.ts`, `beats.ts`, `timeline.ts`, `captions.ts`, `quota.ts`, `cache.ts`, `providers.ts` (dipecah menjadi 3 file ≤ 400 baris), `commons.ts`, `wikimedia.ts`, `gemini-config.ts`, font OFL, dan SFX (`remotion/public/`).
   - 7 suite test salinan (27 test) semuanya lulus; 0 ketergantungan ke `executor.ts`, `page.tsx`, atau Supabase.
   - `THIRD_PARTY_NOTICES.md` mencatat lisensi dependensi, FFmpeg/ffprobe, font OFL, dan SFX.
3. **Kontrak data (`src/core/contracts/`):**
   - Skema Zod + tipe TypeScript untuk `Project`, `FactLedger`, `Script`, `Storyboard`, `Timeline`, dan `QcReport`, plus fixture valid & tidak valid di `tests/contracts.test.ts` (6/6 lulus).
4. **Profil perangkat (`src/core/device/`) & penyimpanan proyek (`src/core/project/store.ts`):**
   - Deteksi CPU/RAM/GPU/NPU + benchmark Remotion 3 detik (`angle` vs `swangle`) → memilih `standar` (`angle` c=2: `8.820 ms`, `swangle` c=1: `15.626 ms` pada `Intel(R) Core(TM) Ultra 7 256V`, `Intel(R) Arc(TM) 140V GPU`, `Intel(R) AI Boost`).
   - Disimpan di `.mgs/device-profile.json` (gitignored).
5. **Klien LLM (`src/core/llm/client.ts`):**
   - `generateJson<T>(schema, prompt, opts)` dengan retry transient (`503`, `429`, timeout), retry JSON/Zod dengan pesan error, fast-fail `DailyQuotaExhaustedError` untuk kuota harian, dan pencatatan panggilan. Diuji dengan `fetch` mock di `tests/llmClient.test.ts` (5/5 lulus). Smoke call nyata: `NOT RUN` (opsional).
6. **CLI (`src/cli/index.ts`) & Penjaga Struktur (`scripts/check-size.ts`, `tests/moduleBoundary.test.ts`):**
   - `npm run mgs -- doctor|new|status|profile` teruji; `npm run verify` lulus penuh (`tsc` kedua package, 11 file / 41 test, `check:size`, batas modul).

### Bukti (`out/review/p1/`)
- [`verify.txt`](../out/review/p1/verify.txt): hasil penuh `npm run verify`
- [`doctor.txt`](../out/review/p1/doctor.txt) & [`device-profile.json`](../out/review/p1/device-profile.json)
- [`tree.txt`](../out/review/p1/tree.txt): struktur folder tanpa `node_modules`
- [`sample-project.json`](../out/review/p1/sample-project.json) & [`sample-status.txt`](../out/review/p1/sample-status.txt)
- [`kit-still.png`](../out/review/p1/kit-still.png): still dari `remotion/src/kit/`
- [`copied-modules.md`](../out/review/p1/copied-modules.md)

### Catatan untuk Pemilik
- `npm run verify` lulus 100% (41/41 test, 0 error TypeScript, `check:size` 30 file OK).
- Smoke call nyata `generateJson` ke Gemini berstatus `NOT RUN` (opsional di P1; sudah diuji penuh dengan mock `fetch`).
