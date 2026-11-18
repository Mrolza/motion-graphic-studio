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
