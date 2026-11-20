# Decisions — Motion-Graphic Studio

Catatan keputusan teknis kecil yang diambil selama implementasi per fase dan usulan perubahan PRD (jika ada).

## P0 — Spike
1. **Versi Remotion & React:** Memakai Remotion `4.0.545` (terbaru) dengan `react` `19.2.0` dan `@react-three/fiber` `9.8.2` karena kompatibel penuh dan berjalan lancar di Windows tanpa perlu fallback ke `4.0.536`.
2. **Encoding hardware Remotion di Windows:** Menggunakan `hardwareAcceleration: "disable"` pada `renderMedia()` karena `"if-possible"` menghasilkan `Error: write EOF` di Windows.
3. **Normalisasi Composition ID Remotion:** Mengganti `_` menjadi `-` pada ID komposisi Remotion (karena Remotion hanya mengizinkan `a-z, A-Z, 0-9, CJK, -`).

## P0b — Uji Generalisasi
1. **Eksekusi sinkron `CameraRig`:** Memindahkan pembaruan `camera.position` dan `camera.lookAt` agar dieksekusi sinkron di render body (+ `useLayoutEffect` sebagai cadangan) karena `useEffect` berjalan setelah `<ThreeCanvas>` menggambar frame.
2. **Retry transient API Gemini:** Menambahkan exponential backoff (maks 3 retry untuk error `503`/`429`) di `run-scene-coder-p0b.ts` karena `gemini-3.5-flash-lite` mengalami lonjakan trafik sementara.

## P1 — Fondasi
1. **Pemecahan `providers.ts`:** `lib/media/providers.ts` dari `content-studio` (1.056 baris) dipecah menjadi `provider-local-cf.ts`, `provider-remote.ts`, dan `providers.ts` (re-export) agar tiap file mematuhi batas ≤ 400 baris (`AG-RULES.md`).
2. **Pemutusan ketergantungan `script-v2.ts` & `executor.ts`:** `wikimedia.ts` memakai interface lokal `WikimediaResearchPackage` (menggantikan impor `ScriptV2ResearchPackage` dari `script-v2.ts`), dan blok test `expandScenesToBeats` di `beats.test.ts` dihapus karena mengimpor `executor.ts`.
3. **Lokasi aset SFX di `audio-mix.ts`:** `resolveExistingSfxPath` mengecek `remotion/public/sfx/` terlebih dahulu (lalu fallback ke `public/sfx/`) karena aset SFX dan font dipindahkan ke `remotion/public/`.
4. **Lokasi state kuota di `quota.ts`:** Dipindahkan dari `data/quota.json` ke `.mgs/quota.json` agar semua state lokal berada di `.mgs/` (yang sudah di-gitignore), dan `data/` ditambahkan ke `.gitignore`.

## P3B — Suara, Storyboard, & Scene Coder
1. **Field opsional `spoken_text` di `ScriptSentenceSchema`:** Ditambahkan untuk menyimpan teks ucapan ramah-TTS Indonesia (mis. `"1:20"` → `"satu banding dua puluh"`, `"3,5"` → `"tiga koma lima"`, `"720°"` → `"720 derajat"`) tanpa mengubah teks tampilan (`text`).
2. **Field opsional `visible_parts` di `StoryboardSceneSchema`:** Ditambahkan untuk mendeklarasikan sub-bagian fokus yang wajib terlihat pada QC `visibility`.

## P4 — Akurasi Teks di Layar, Audio, & Video Final
1. **Zona Tata Letak 9:16 (`src/core/render/layout-zones.ts` & `HudZones.tsx`):** Untuk menghindari UI Shorts/Reels/TikTok (bawah 20% `y >= 1024` dan kanan 15% `x >= 612`), seluruh zona memakai `left: 48`, `right: 112` (`maxWidth: 560`). Zona vertikal: `title` (`top: 72, maxHeight: 160`), `free` (`top: 240, maxHeight: 540`), `callout` (`top: 790, maxHeight: 140`), dan `caption` (`top: 942, maxHeight: 78`).
2. **Encoder Final (`final-render.ts`):** Chunk video dirender dengan encoder default Remotion (`libx264` yuv420p, 30 fps) dan dimux satu kali dengan `audio/mix.wav` (AAC 48 kHz) agar tidak ada celah audio di batas chunk.
