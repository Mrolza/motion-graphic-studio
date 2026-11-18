# Metrics — P0b Spike (Uji Generalisasi: Mesin 4 Tak dari Primitif Umum)

> Tanggal: 2026-11-18 · Model: `gemini-3.5-flash-lite` · Topik: "Bagaimana mesin 4 tak bekerja?"

## 1. Gemini Scene Coder (`run-scene-coder-p0b.ts`)

| Adegan | Durasi | Panggilan | Perbaikan | Status | Alasan Retry Percobaan 1 | Still Tengah (`meanLuma` / `nonBgRatio`) |
|---|---:|---:|---:|---|---|---|
| `Scene1_EngineCutaway` | 6s | 2 | 1 | Lolos (retry 1) | 280 baris > batas 220 | 31.65 / 0.6766 |
| `Scene2_IntakeCompression` | 6s | 2 | 1 | Lolos (retry 1) | 266 baris > batas 220 | 37.89 / 0.6332 |
| `Scene3_PowerExhaust` | 7s | 2 | 1 | Lolos (retry 1) | 275 baris > batas 220 | 37.61 / 0.6276 |
| `Scene4_CycleSummary` | 6s | 2 | 1 | Lolos (retry 1) | 267 baris > batas 220 | 31.26 / 0.5249 |

- **Total panggilan:** 8 (di luar retry jaringan akibat error `503 UNAVAILABLE` sementara dari API Gemini).
- **Lolos tanpa perbaikan:** 0 / 4 (keempatnya langsung valid secara TypeScript & linkage pada percobaan 1, hanya melebihi batas panjang 220 baris karena menyusun mesin lengkap dari primitif).
- **Lolos setelah 1 perbaikan:** 4 / 4 (100%).
- **Gagal total:** 0 / 4.

## 2. Render Video Gabungan (`spike2.mp4`)
- **Durasi:** 24.20 detik (726 frame @ 30 fps, 720×1280, transisi cross-fade 8 frame).
- **Waktu render (`gl: "angle"`, concurrency 2, `hardwareAcceleration: "disable"`):** 37,061 ms (~37.1 detik).
- **Pemeriksaan 12 still (awal, tengah, akhir × 4 adegan):** 12/12 `isBlank = false` (`meanLuma` 30.88–39.41).

## 3. Temuan Penting untuk P3
1. **Sinkronisasi `CameraRig` sebelum render frame:** Pada percobaan render pertama, `camera.lookAt()` di dalam `useEffect` berjalan *sesudah* `<ThreeCanvas>` menggambar frame, sehingga kamera sempat menghadap `[0,0,0]`. Pembaruan ke eksekusi sinkron sebelum render + `useLayoutEffect` langsung memperbaiki framing di semua 4 adegan.
2. **Batas baris kode adegan primitif:** Menyusun mesin multi-bagian dari primitif (`Box`, `Cylinder`, `Sphere`, `Torus`, `Cone`) secara alami memakan 260–280 baris jika belum diringkas. Gemini mampu meringkasnya ke 60–133 baris saat diminta di retry ke-1.
3. **Collision HUD:** Di `Scene1` dan `Scene3`, `Callout` (`boxX=480..510, boxY=400..440`) bersinggungan dengan `StatCounter` (`top-right` di `top: 295`). Di P3 perlu aturan zona HUD / anti-overlap otomatis antara `StatCounter` dan `Callout`.
