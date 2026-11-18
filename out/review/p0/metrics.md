# Metrics — P0 Spike (Blueprint 3D + Scene Kit + Gemini Scene Coder)

> Tanggal: 2026-11-18 · Perangkat: `Intel(R) Core(TM) Ultra 7 256V` (8 logical CPUs, RAM 15,921 MB, Windows 10/11 `win32 10.0.26200 x64`)

## 1. Versi Paket (`spike/package.json`)
- `remotion`: `4.0.545`
- `@remotion/three`: `4.0.545`
- `@remotion/renderer`: `4.0.545`
- `@remotion/bundler`: `4.0.545`
- `@remotion/cli`: `4.0.545`
- `three`: `0.187.0`
- `@react-three/fiber`: `9.8.2`
- `react` / `react-dom`: `^19.2.0`
- `@google/genai`: `^1.0.0` (installed `1.52.0`)
- `typescript`: `^5.7.0`

## 2. Benchmark Render (`BenchmarkScene`: 6 detik, 180 frame, 720×1280, 30 fps)

| WebGL (`gl`) | Concurrency | `hardwareAcceleration` | `render_ms` | RAM Bebas Awal (MB) | RAM Bebas Min (MB) | Status |
|---|---:|---|---:|---:|---:|---|
| `angle` (iGPU Arc) | 1 | `disable` | 19,009 | 1,151 | 754 | OK |
| `angle` (iGPU Arc) | 2 | `disable` | 10,789 | 1,693 | 1,406 | OK |
| `angle` (iGPU Arc) | 4 | `disable` | 7,090 | 2,260 | 1,057 | OK |
| `swangle` (software) | 1 | `disable` | 21,385 | 1,796 | 1,598 | OK |
| `swangle` (software) | 2 | `disable` | 17,879 | 2,207 | 1,441 | OK |
| `swangle` (software) | 4 | `disable` | 17,044 | 2,200 | 1,081 | OK |

### Perbandingan Visual `angle` vs `swangle` (Frame 90)
- `angle`: `meanLuma = 30.43`, `stdDevLuma = 47.09`, `nonBgRatio = 0.8364`
- `swangle`: `meanLuma = 30.03`, `stdDevLuma = 46.87`, `nonBgRatio = 0.8409`
- **Selisih piksel:** `meanDiff = 0.607 / 255`, **98.56%** piksel berada dalam toleransi `<= 8` (identik secara visual; perbedaan hanya anti-aliasing tepi poligon).

### Catatan Akselerasi Hardware Remotion di Windows
- Uji coba `hardwareAcceleration: "if-possible"` pada `renderMedia()` gagal di Windows dengan `Error: write EOF` pada pipe encoder.
- Dengan `hardwareAcceleration: "disable"` (encoding CPU x264), seluruh 6 kombinasi render berjalan stabil. Untuk akselerasi hardware di Windows pada fase P4, encoding QSV/NVENC sebaiknya dilakukan di langkah FFmpeg (S11) jika tersedia, bukan lewat opsi `hardwareAcceleration` Remotion.

## 3. Gemini Scene Coder (`gemini-3.5-flash-lite`)

| Adegan | Durasi | Panggilan | Perbaikan | Status | Still Tengah (`meanLuma` / `nonBgRatio`) |
|---|---:|---:|---:|---|---|
| `Scene1_TrainDrive` | 6s | 1 | 0 | Lolos langsung | 27.90 / 0.8076 |
| `Scene2_WheelFlange` | 7s | 1 | 0 | Lolos langsung | 46.35 / 0.8063 |
| `Scene3_RailGauge` | 6s | 1 | 0 | Lolos langsung | 30.84 / 0.8625 |
| `Scene4_Suspension` | 6s | 1 | 0 | Lolos langsung | 37.83 / 0.8212 |

- **Total panggilan:** 4
- **Lolos tanpa perbaikan:** 4 / 4 (100%)
- **Butuh perbaikan:** 0 / 4
- **Gagal total:** 0 / 4

## 4. Render Video Gabungan (`spike.mp4`)
- **Durasi:** 24.20 detik (726 frame @ 30 fps, 720×1280, transisi cross-fade 8 frame antaradegan)
- **Waktu render (`gl: "angle"`, concurrency 2):** 38,237 ms (~38.2 detik)
- **Pemeriksaan 12 still (awal, tengah, akhir × 4 adegan):** 12/12 `isBlank = false` (`meanLuma` 21.21–48.96).

## 5. Temuan Visual & Catatan untuk Fase Berikutnya
- **Z-fighting ringan pada flens roda:** di `Scene2_WheelFlange` dan `Scene4_Suspension`, sisi dalam tread roda dan flens berbagi bidang koplanar sehingga muncul pola arsir halus. Di fase P3 (`Scene Kit`), geser posisi `flangeX` sebesar `0.002` agar bebas z-fighting.
- **ID Komposisi Remotion:** Remotion menolak karakter `_` pada `Composition id` (hanya `a-z, A-Z, 0-9, CJK, -`). Penamaan ID komposisi perlu dinormalisasi (misalnya mengganti `_` dengan `-`).
- **Peringatan `THREE.Clock` deprecated:** berasal dari `@react-three/fiber` / `three@0.187.0` di console browser; tidak memengaruhi render.
