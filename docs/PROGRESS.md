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
