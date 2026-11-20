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

---

## Fase P2 — Fakta & Naskah (`docs/P2-FACTS-SCRIPT.md`)

- **Status:** **PARTIAL** (1/3 topik E2E + uji mutasi L3 + seluruh 49 unit test lulus; 2/3 topik E2E tertahan `Gemini HTTP 503 UNAVAILABLE` berkepanjangan pada `gemini-3.5-flash-lite`)
- **Branch:** `phase/p2-facts-script` (tag awal: `p2-start`; P1 sudah di-merge ke `main` dengan tag `p1-done`)
- **Tanggal:** 2026-11-18

### Apa yang Dibuat
1. **Tindak lanjut `REVIEW-P1.md` & merge P1:**
   - `data/` ditambahkan ke `.gitignore`; state kuota di `src/core/assets/quota.ts` dipindah ke `.mgs/quota.json`.
   - Ditambahkan test `captions.test.ts` (1 test) dan `cache.test.ts` (2 test).
   - Bukti `out/review/p1/*.txt`/`*.json` dikonversi ke UTF-8.
   - `phase/p1-foundation` di-merge (`--no-ff`) ke `main` dengan tag `p1-done`, lalu dibuat branch `phase/p2-facts-script` (`p2-start`).
2. **S1 Ide (`src/core/stages/ideate.ts`):** menghasilkan 3 konsep beserta `core_claims[]` dan `search_queries[]`.
3. **S2 Riset, Fact Ledger, L1 & L0 (`src/core/research/wikipedia.ts`, `src/core/qc/l1-ledger.ts`, `src/core/stages/research.ts`):**
   - Pengambilan teks Wikipedia (`id`/`en`) dan Wikimedia On This Day (`today_in_history`) tanpa API key, disimpan ke `projects/<id>/sources/`.
   - Pemeriksaan L1 (pencocokan kutipan verbatim setelah normalisasi spasi/kutip/dash + cek `value` sadar format angka `en`/`id-ID`) dan L0 (`concept_unverifiable`).
4. **S3 Naskah & S4 QC L2/L3 (`src/core/prompts/scriptwriter.md`, `src/core/formats/format-packs.ts`, `src/core/qc/l2-script.ts`, `src/core/qc/l3-verifier.ts`, `src/core/stages/script.ts`):**
   - Naskah hanya memakai klaim `verified`; pemeriksaan L2 (kode) + L3 (verifier LLM adversarial) + maks 1 kali tulis ulang otomatis.
5. **Gerbang 1 via CLI (`src/cli/gate1.ts`, `src/cli/index.ts`):**
   - `mgs ideate`, `mgs research`, `mgs script`, `mgs qc`, `mgs run <id> --until gate1`, `mgs review`, `mgs approve`.
6. **Test & Uji Mutasi:**
   - `tests/qcFacts.test.ts` (5 test perilaku L1/L0/L2 dengan fixture offline).
   - Uji mutasi nyata (`scripts/run-p2-mutation.ts`): L2 dan L3 keduanya menangkap mutasi pada `p2-kereta`.
   - Smoke call nyata `generateJson` ke `gemini-3.5-flash-lite` berhasil (`6.896 ms`).

### Bukti (`out/review/p2/`, semua UTF-8)
- [`p2-kereta/`](../out/review/p2/p2-kereta/): `fact-ledger.json`, `script.json`, `qc/` (`L0`–`L3`), `review.txt` (6 panggilan LLM, 0 error L2/L3, Gate 1 **APPROVED**).
- [`mutation-test/`](../out/review/p2/mutation-test/): `mutated-script.json`, `qc-L2-mutated.json`, `qc-L3-mutated.json`, `mutation-summary.md`.
- [`stats.md`](../out/review/p2/stats.md) & [`verify.txt`](../out/review/p2/verify.txt).

### Yang Belum & Alasannya
- Uji end-to-end topik `p2-mesin4tak` (`technical`) dan `p2-history-0720` (`today_in_history`) gagal diselesaikan karena API `gemini-3.5-flash-lite` mengalami lonjakan trafik berkepanjangan (`HTTP 503 UNAVAILABLE`) saat tahap S1/S2 meski sudah diberi 6 kali retry exponential backoff. Tinggal dijalankan ulang saat model stabil: `npm run mgs -- new ...` + `npm run mgs -- run <id> --until gate1`.

---

## Fase P2B — Relevansi, Kualitas Naskah, dan Ketahanan (`docs/P2B-RELEVANCE.md`)

- **Status:** **DONE**
- **Branch:** `phase/p2-facts-script` (lanjutan P2 sesuai `P2B-RELEVANCE.md`)
- **Tanggal:** 2026-11-19

### Apa yang Diperbaiki & Dibuat
1. **Riset tepat sasaran (`ideate.ts`, `wikipedia.ts`, `research.ts`):**
   - `S1` menghasilkan `wiki_titles` (`en` dan `id`); `S2` mengambil artikel berdasarkan judul dulu (`&redirects=1`), urutan bahasa `en` dulu untuk topik teknik/sains (`id` dulu untuk `today_in_history`).
   - Ekstraktor klaim menilai relevansi tiap sumber (`relevant | partial | irrelevant`) di panggilan yang sama; sumber `irrelevant` dibuang dan dicatat ke `sources.md`.
2. **Logika L0 diperbaiki (`research.ts`):**
   - Jika ada `core_claims` yang belum didukung klaim `verified`, sistem menjalankan **1 putaran riset tambahan** khusus untuk klaim yang hilang sebelum menandai `concept_unverifiable`.
3. **QC L0b Relevansi & L3 Ketat (`src/core/qc/l0b-quality.ts`, `l3-verifier.ts`):**
   - Digabung dalam **1 panggilan verifier** (`l0b` + `l3`). Memeriksa `answers_question`, skor 1–5 (`answers_direct`, `coverage`, `structure`, `on_topic`), dan menolak generalisasi berlebihan (`overstated`). `mgs approve` menolak jika `answers_question = false`.
4. **Cek durasi/kata & prompt scriptwriter (`l2-script.ts`, `src/core/prompts/scriptwriter.md`):**
   - `verifyScriptL2` memeriksa jumlah kata terhadap `target_duration_sec * 2,3` (±20%).
   - `scriptwriter.md` dilengkapi aturan hook + payoff, jawaban cepat, rantai sebab→akibat, dan gaya TTS `id-ID`.
5. **Ketahanan 503 & resumable (`llm/client.ts`, `cli/gate1.ts`):**
   - Exponential backoff dengan jitter (maks 5 retry hingga ~60s) + dukungan opsional `GEMINI_FALLBACK_MODEL`.
   - `mgs run <id> --until gate1` melewati tahap yang sudah `done`.

### Bukti (`out/review/p2/`, semua UTF-8)
- [`p2-kereta/`](../out/review/p2/p2-kereta/): `fact-ledger.json`, `script.json`, `qc/` (`L0`, `L0b`, `L1`, `L2`, `L3`), `review.txt`, `sources.md` (**7 panggilan**, `answers_question = ya (5/5/5/5)`, `100` kata, `0` error L2/L3; menjelaskan roda kerucut `1 banding 20`, inersia tikungan, dan gandar kaku).
- [`p2-mesin4tak/`](../out/review/p2/p2-mesin4tak/): (**10 panggilan**, `answers_question = ya (5/5/5/5)`, `87` kata, `0` error L2/L3).
- [`p2-history-0720/`](../out/review/p2/p2-history-0720/): (**7 panggilan**, `answers_question = ya (5/2/4/5)`, `100` kata, `0` error L2/L3; catatan: skor `coverage = 2/5` karena feed OnThisDay 07-20 menautkan artikel peringatan Apollo 11).
- [`mutation-test/`](../out/review/p2/mutation-test/): 4 mutasi halus (`mut1-similar-number`, `mut2-generalization`, `mut3-cause-effect`, `mut4-off-topic`) — **4/4 TERTANGKAP** oleh L2, L3, atau L0b (`mutation-summary.md`).
- [`stats.md`](../out/review/p2/stats.md) (rata-rata **8,00 panggilan/topik**, target ≤ 8) & [`verify.txt`](../out/review/p2/verify.txt).

---

## Fase P2C — Menutup Celah QC & Gerbang 1 (`docs/P2C-GATES.md`)

- **Status:** **DONE**
- **Branch:** `phase/p2-facts-script` (lanjutan P2 sesuai `P2C-GATES.md` & `REVIEW-P2B.md`)
- **Tanggal:** 2026-11-20

### Apa yang Diperbaiki & Dibuat
1. **Gerbang 1 memblokir semua error di L0, L0b, L1, L2, L3 (`src/core/qc/gate1-check.ts`, `src/cli/gate1.ts`):**
   - `validateGate1Approval` menolak approval jika ada error di `L0`, `L0b`, `L2`, `L3`, `L0b.answers_question === false`, atau `claim_refs` merujuk klaim yang tidak `verified`.
   - Error `L1` pada klaim yang **tidak dipakai** di naskah diturunkan menjadi `info` (`"klaim dibuang: ..."`); error `L1` pada klaim yang dipakai tetap memblokir.
2. **Pengetatan L0, L1, L0b, L3 (`l1-ledger.ts`, `l0b-quality.ts`, `qc-report.ts`):**
   - **L0:** memakai `coreClaimMapping` (`supports_core_claim_indices`) secara ketat, bukan sekadar kecocokan 2 kata.
   - **L1:** menolak kutipan potongan frasa (`QUOTE_FRAGMENT`, dengan pengenalan batas kalimat termasuk setelah judul bagian Wikipedia `== ... ==`) dan menolak klaim dengan angka/tahun/bulan yang tidak ada di kutipan (`CLAIM_FACT_NOT_IN_QUOTE`, mendukung padanan bulan ID/EN).
   - **L0b:** menolak adegan keluar topik (`has_off_topic_scene` -> error `L0B_OFF_TOPIC`) dan untuk `today_in_history` mewajibkan kejadian utama bertanggal lengkap di awal naskah (`main_event_dated === false` -> error `L0B_MISSING_MAIN_EVENT`).
   - **L3:** memeriksa **semua** kalimat termasuk yang bertanda `non_factual: true` (pertanyaan retoris murni diizinkan sebagai `supported`; opini/klaim evaluatif dengan `non_factual: true` ditolak sebagai error `NON_FACTUAL_ASSERTION`), membandingkan `claim_text` vs `quote`, serta menolak perubahan kuantitas/cakupan parafrase (`overstated`).
3. **Perbaikan riset sejarah & prompt (`wikipedia.ts`, `ideate.ts`, `research.ts`, `format-packs.ts`, `scriptwriter.md`, `script.ts`):**
   - `fetchTodayInHistorySources` mengambil artikel utama `Apollo 11` (bukan halaman peringatan tahunan), `ideate.ts` & `research.ts` menyertakan artikel utama `wiki_titles` terlebih dahulu serta memperbaiki putaran riset tambahan agar menargetkan `coreIndices` yang hilang.
   - `format-packs.ts` & `scriptwriter.md` mewajibkan scene 1–2 `today_in_history` menyebut peristiwa utama + tanggal & tahun, dan melarang klaim evaluatif memakai `non_factual: true`.
4. **Tes baru (`tests/qcGate1.test.ts`):**
   - 4 unit test baru untuk Gate 1 blocking/downgrade, L0 ketat, `QUOTE_FRAGMENT`, dan `CLAIM_FACT_NOT_IN_QUOTE` (termasuk `20 Juli` <-> `July 20`).

### Bukti (`out/review/p2/`, semua UTF-8)
- [`p2-kereta/`](../out/review/p2/p2-kereta/): Gate 1 **APPROVED** — `L0:0 isu`, `L0b:0 isu (ya, 5/5/5/5)`, `L1:0E / 0W / 1I` (1 klaim dibuang sebagai `info`), `L2:0 isu`, `L3:0 isu`, `97/~103` kata (15 panggilan kumulatif termasuk rewrite P2C).
- [`p2-mesin4tak/`](../out/review/p2/p2-mesin4tak/): Gate 1 **APPROVED** — `L0:0 isu`, `L0b:0 isu (ya, 5/5/5/5)`, `L1:0 isu`, `L2:0 isu`, `L3:0 isu`, `95/~103` kata (18 panggilan kumulatif termasuk rewrite P2C).
- [`p2-history-0720/`](../out/review/p2/p2-history-0720/): Gate 1 **APPROVED** — `L0:0 isu`, `L0b:0 isu (ya, 5/5/5/5)`, `L1:0E / 0W / 2I` (2 klaim dibuang sebagai `info`), `L2:0E / 1W / 0I` (`WARNING` pada `S1.2`: `NAME_NOT_IN_CLAIM` untuk kata `"Bulan"`), `L3:0 isu`, `99/~103` kata, `9` panggilan LLM; menyebut `"20 Juli 1969"` dan pendaratan Apollo 11 bersumber dari artikel `Apollo 11` (serta `Lunar Module Eagle` & `Mare Tranquillitatis`).
- [`mutation-test/mutation-summary.md`](../out/review/p2/mutation-test/mutation-summary.md): **8/8 mutasi** (`mut1`–`mut8`) tertangkap sebagai **ERROR** (termasuk `mut7` L1 tanggal salah & `mut4/8` off-topic).
- [`stats.md`](../out/review/p2/stats.md) & [`verify.txt`](../out/review/p2/verify.txt).

### Catatan Kejujuran Isu Tersisa
- Tidak ada **error** tersisa di `L0`, `L0b`, `L1`, `L2`, maupun `L3` pada ketiga topik.
- Masih terdapat `1 WARNING` di `L2` pada `p2-history-0720` (`NAME_NOT_IN_CLAIM` pada `S1.2` karena kata `"Bulan"` muncul di naskah sementara klaim `C6` merujuk `Base Tranquillity`), serta `info` pada klaim `L1` yang tidak dipakai (`1I` di `p2-kereta`, `2I` di `p2-history-0720`).
- Rata-rata panggilan LLM kumulatif pada `stats.md` adalah **14,00** panggilan/topik (karena `p2-kereta` & `p2-mesin4tak` membawa akumulasi panggilan dari run P2B + rewrite P2C; untuk run segar `p2-history-0720` tercatat **9** panggilan).

---

## Fase P3A — Scene Kit Blueprint + QC Visual Otomatis (`docs/P3A-SCENE-KIT.md`)

- **Status:** **DONE**
- **Branch:** `phase/p3a-scene-kit` (tag awal `p3a-start`, setelah merge P2 ke `main` dengan tag `p2-done`)
- **Tanggal:** 2026-11-20

### Apa yang Dikerjakan & Dibuat
1. **Langkah 0 (`REVIEW-P2C.md` + Merge P2):**
   - Menerapkan 4 tindak lanjut: `CLAIM_NAME_NOT_IN_QUOTE` (`l1-ledger.ts`), `hook_paid` & `main_event_named` (`l0b-quality.ts`, `format-packs.ts`, `scriptwriter.md`), serta `llm_calls_last_run` terpisah (`project.ts`, `store.ts`, `gate1.ts`, `script.ts`).
   - Uji ulang S4 `p2-history-0720` lulus Gerbang 1 (**APPROVED**, 0 error setelah 1x rewrite; [`followup.md`](../out/review/p2/followup.md)).
   - Merge `phase/p2-facts-script` ke `main` (`--no-ff`), tag `p2-done`, lalu buat `phase/p3a-scene-kit` (`p3a-start`).
2. **Scene Kit (`remotion/src/kit/`):**
   - `tokens/`: 3 palet (`blueprint-navy`, `industrial-orange`, `dark-mystery`), font OFL, ukuran minimum teks (`≥44px` judul, `≥32px` caption, `≥26px` callout).
   - `primitives/`: `Box`, `Cylinder`, `Sphere`, `Torus`, `Cone`, `Group`, `Ground`/`Grid`, `Line3D`, `Arrow3D`, `Label3D`, dukungan `cutaway`/transparansi.
   - `drivers/`: `useDriver` (single driver) + helper kinematika murni (`solveCrankSlider`, `gearRatioAngle`, `wheelAngleFromDistance`, `springOscillation`, `valveStateFromCrankAngle`, `formatIdNumber`).
   - `camera/`: `CameraRig` dengan preset 9:16 dan mode `frameEntities`.
   - `assemblies/`: `WheelsetOnRail` (menapak rel, tanpa z-fighting), `PistonCrankAssembly` (cutaway, piston/batang/engkol/katup/busi dari `crankAngleDeg`), `Suspension` (pegas tersambung ke rangka).
   - `foreground/` & `transitions/`: `ParallaxForeground` (tiang lewat & garis kedalaman) dan `SceneTransition`.
   - `hud/`: tata letak berbasis zona (`HudLayout`, `HudZone` untuk `title`, `free`, `callout`, `caption`), `KineticTitle`, `StatCounter` (`bindToDriver` tanpa easing sendiri), `MeasureReveal` (garis ukur + nilai tetap tanpa count-up), `DimensionLine`, `Callout`, `ListReveal`, `DateStamp`, `Timeline`, `CompareCard`, `Waveform`.
   - `telemetry/`: `TelemetryProvider` (`inputProps.telemetry = true`), `TelemetryEntity` (proyeksi `Box3` ke bounding box layar 2D + `partStates`), `TelemetryHudBox` (bounding box DOM HUD), log `MGS_TELEMETRY {...}`.
   - `KIT-API.md`: dihasilkan otomatis dari AST TypeScript & JSDoc via `scripts/generate-kit-api.ts` (66 item di 10 kategori).
3. **QC Visual Otomatis (`src/core/qc/visual/`) & CLI:**
   - 5 pemeriksaan: `mechanics`, `framing`, `hud-overlap`, `hud-format`, dan `blank` (luma mean/std via FFmpeg), dengan CLI `mgs qc-visual --composition <id>`.
4. **Komposisi Demo & Uji Mutasi:**
   - `DemoKereta` (12s, 360 frame) dan `DemoMesin` (16s, 480 frame), keduanya lulus semua QC visual.
   - 5 mutasi perilaku (`mut1-time-valve`, `mut2-hud-easing`, `mut3-framing`, `mut4-hud-overlap`, `mut5-hud-format`) semuanya **FAIL** dengan error pada layer yang tepat.

### Bukti (`out/review/p3a/`)
- [`demo-kereta.mp4`](../out/review/p3a/demo-kereta.mp4) & [`demo-kereta-contact-sheet.png`](../out/review/p3a/demo-kereta-contact-sheet.png) (720×1280, 30 fps, 12s).
- [`demo-mesin.mp4`](../out/review/p3a/demo-mesin.mp4) & [`demo-mesin-contact-sheet.png`](../out/review/p3a/demo-mesin-contact-sheet.png) (720×1280, 30 fps, 16s).
- [`qc/`](../out/review/p3a/qc/): `DemoKereta-qc.json` (`passed: true`, 45 sampel, 0 error) & `DemoMesin-qc.json` (`passed: true`, 60 sampel, 0 error).
- [`mutations/mutation-summary.md`](../out/review/p3a/mutations/mutation-summary.md): 5/5 mutasi tertangkap (`mechanics`: 29 & 59 error; `framing`: 45 error; `hudOverlap`: 45 error; `hudFormat`: 1 error).
- [`perf.md`](../out/review/p3a/perf.md): `DemoKereta` normal `9794 ms` vs telemetri `11883 ms` (`+21.3%`); `DemoMesin` normal `13894 ms` vs telemetri `14171 ms` (`+2.0%`).
- [`KIT-API.md`](../out/review/p3a/KIT-API.md), [`followup.md`](../out/review/p3a/followup.md), [`verify.txt`](../out/review/p3a/verify.txt).

---

## Fase P3A2 — Geometri yang Benar, Bagian Penting Terlihat, Demo yang Menjelaskan (`docs/P3A2-VISUAL-TRUTH.md`)

- **Status:** **DONE**
- **Branch:** `phase/p3a-scene-kit` (tindak lanjut `docs/REVIEW-P3A.md`)
- **Tanggal:** 2026-11-20

### Apa yang Diperbaiki & Dibuat
1. **Tata letak geometri murni & QC `geometry` (`remotion/src/kit/drivers/geometry.ts`, `src/core/qc/visual/checks.ts`):**
   - Fungsi murni teruji unit `computeWheelsetLayout` (jalur Z lurus & melengkung, `left/rightContactGap`, `axlePerpendicularDot`, `wheelSpacing`, `flangesInside`, `left/rightEffectiveRadius`) dan `computePistonCrankLayout` (`rodTopToPistonPinGap`, `rodBottomToCrankPinGap`, `pistonInsideCylinder`).
   - Pemeriksaan baru **`geometry`** memeriksa seluruh batasan koordinat dunia dari telemetri di setiap frame sampel.
2. **Perbaikan `WheelsetOnRail` + `CurvedRail` (`remotion/src/kit/assemblies/`):**
   - Gandar tegak lurus rel (sumbu X) dengan roda berputar di sumbu X menapak flush di atas kepala rel (`y = 0,22`), flens di sisi dalam rel, dukungan `taperExaggeration`, `CurvedRail`, dan cincin diameter efektif.
3. **Keterlihatan bagian penting (`visibility`) & `CameraRig` sadar zona HUD (`TelemetryEntity.tsx`, `CameraRig.tsx`, `checks.ts`):**
   - Entitas mendeklarasikan `partRefs` (`wheel_left`, `wheel_right`, `contact_left`, `contact_right`, `flange` pada kereta; `piston`, `crank`, `intake_valve`, `exhaust_valve`, `spark_plug` pada mesin) yang proyeksi layar 2D-nya dilaporkan per frame.
   - Pemeriksaan baru **`visibility`** menolak bagian yang keluar area aman atau tertutup HUD > 25%.
   - `CameraRig` (`mode="frameEntities"`) menempatkan subjek fokus di zona bebas tengah layar agar tidak tertutup panel HUD.
4. **Anggaran HUD (`hud-overlap`) & Callout berpenunjuk:**
   - Maksimal **2 panel HUD** aktif bersamaan di luar zona judul (`HUD_BUDGET_EXCEEDED`), pencatatan `claimRef` di telemetri HUD, dan dukungan `pointerTo` pada `Callout`.
5. **Demo Kereta dibuat ulang dari klaim P2 (`DemoKereta.tsx`, 15 detik, 450 frame) & Demo Mesin diperjelas (`DemoMesin.tsx`, 16 detik, 480 frame):**
   - `DemoKereta`: Adegan A (kerucut 1:20 dilebihkan + flens, `C1`), Adegan B (tikungan + geser ke rel luar + panah inersia, `C2`), Adegan C (cincin diameter efektif roda luar vs dalam, `C3`); HUD "Jarak Tempuh" dihapus.
   - `DemoMesin`: poros engkol terlihat penuh sepanjang video, katup & percikan busi diperbesar/disorot, warna ruang bakar berubah sesuai langkah dari penggerak `crank_angle`.
6. **Perbaikan kecil P2 (`src/core/qc/l1-ledger.ts`, `tests/qcGate1.test.ts`):**
   - `CLAIM_NAME_NOT_IN_QUOTE` mencocokkan nama belakang pada nama diri multi-kata (`"Neil Armstrong"` ↔ `"Armstrong"`).

### Bukti (`out/review/p3a/`)
- [`demo-kereta.mp4`](../out/review/p3a/demo-kereta.mp4) & [`demo-kereta-contact-sheet.png`](../out/review/p3a/demo-kereta-contact-sheet.png) (15s, 720×1280, 30 fps).
- [`demo-mesin.mp4`](../out/review/p3a/demo-mesin.mp4) & [`demo-mesin-contact-sheet.png`](../out/review/p3a/demo-mesin-contact-sheet.png) (16s, 720×1280, 30 fps).
- [`stills/`](../out/review/p3a/stills/): 9 still penuh `DemoKereta` (awal/tengah/akhir × 3 adegan) + 4 still penuh `DemoMesin` (hisap, kompresi, usaha+busi, buang).
- [`qc/`](../out/review/p3a/qc/): `DemoKereta-qc.json` (**`passed: true`**, 57 sampel, 0 error di `mechanics`, `geometry`, `visibility`, `framing`, `hudOverlap`, `hudFormat`, `blank`) & `DemoMesin-qc.json` (**`passed: true`**, 60 sampel, 0 error di semua layer).
- [`mutations/mutation-summary.md`](../out/review/p3a/mutations/mutation-summary.md): **10/10 mutasi** tertangkap dengan error yang tepat (`mut1`–`mut5` P3A + `mut6-lift-wheel` `114` error `geometry`, `mut7-rotate-axle` `57` error `geometry`, `mut8-detach-rod` `120` error `geometry`, `mut9-occlude-crank` `59` error `visibility`, `mut10-three-panels` `38` error `hudOverlap`).
- [`perf.md`](../out/review/p3a/perf.md): `DemoKereta` normal `13572 ms` vs telemetri `14405 ms` (`+6.1%`); `DemoMesin` normal `13790 ms` vs telemetri `13531 ms` (`-1.9%`).
- [`verify.txt`](../out/review/p3a/verify.txt) (UTF-8).

---

## Fase P3B — Suara, Storyboard, dan Gemini Scene Coder (`docs/P3B-STORYBOARD-CODER.md`)

- **Status:** **DONE**
- **Branch:** `phase/p3b-storyboard-coder` (tag awal `p3b-start`, setelah perbaikan `REVIEW-P3A2.md` & merge P3A ke `main` dengan tag `p3a-done`)
- **Tanggal:** 2026-11-20

### Langkah 0 (`REVIEW-P3A2.md` + Merge P3A)
- Menyelesaikan 6 perbaikan `REVIEW-P3A2.md` (tapak kerucut padat `LatheGeometry`, cincin diameter efektif kontras, panah inersia `Arrow3D` tebal, cek `HUD_CLAIM_ID_LEAK`, warning `FRAMING_TOO_SMALL`, format derajat `"68°"` tanpa spasi), dengan bukti render ulang di [`out/review/p3a/fix/`](../out/review/p3a/fix/) (`DemoKereta` & `DemoMesin` keduanya `passed=true`, `0` framing warning, `0` visibility error).
- Merge `phase/p3a-scene-kit` ke `main` (`--no-ff`, tag `p3a-done`), lalu buat `phase/p3b-storyboard-coder` (`p3b-start`).

### Apa yang Dikerjakan & Dibuat (P3B)
1. **S5 Suara & Timeline (`src/core/stages/voice.ts`):**
   - `toIndonesianSpokenText` mengubah angka/rasio/derajat ke `spoken_text` ramah TTS (`"1:20"` → `"1 banding 20"`, `"1.435"` → `"1435"`, `"3,5"` → `"3 koma 5"`, `"720°"` → `"720 derajat"`) tanpa mengubah teks tampilan (dicatat di `docs/DECISIONS.md`).
   - Sintesis VO per adegan via `msedge-tts` (`id-ID-ArdiNeural`) + word boundary timing → `timeline.json` + `audio/vo-full.mp3`, tanpa Gemini (`mgs voice <id>`).
2. **S6–S7 Storyboard & QC Storyboard (`src/core/stages/storyboard.ts`, `src/core/qc/storyboard.ts`):**
   - `S6`: 1 panggilan Gemini menghasilkan `storyboard.json` (`lane: code_3d`, `focus_entities`, `visible_parts`, `driver`, `invariants`, `hud` maks 2 panel, `trigger_words`).
   - `S7`: cek kode deterministik (durasi timeline, `trigger_words`, `claim_ref` ke klaim `verified`, angka cocok dengan ledger & format `id-ID`, maks 2 HUD, invarian merujuk driver) + 1 panggilan LLM konsistensi visual, maks 1 penulisan ulang.
3. **S8–S9 Scene Coder, Validasi Berurutan, & QC `sync` (`src/core/stages/scene-coder.ts`, `scene-safety.ts`, `scene-registry.ts`, `media-checks.ts`):**
   - Per adegan: Gemini menulis `.tsx` menggunakan Scene Kit saja, lalu divalidasi berurutan: whitelist impor & larangan API (`<= 300` baris, wajib `TelemetryProvider` + `BlueprintStage` + rakitan/`TelemetryEntity`) → `tsc --noEmit` → render telemetri & seluruh QC visual P3A + **`sync`** (gerak utama mulai dalam `±0,35s` dari `trigger_words`), maks 2 perbaikan per adegan.
4. **Perakitan & Pratinjau VO (`src/core/stages/preview.ts`, `src/cli/p3b.ts`):**
   - Menggabungkan adegan lewat `<Series>` sesuai durasi `timeline.json`, merender `720×1280` 30 fps sesuai profil perangkat, dan melakukan mux dengan VO mentah ke `preview.mp4`.
   - CLI: `mgs voice <id>`, `mgs storyboard <id>`, `mgs scenes <id>`, `mgs render <id> --preview`, `mgs run <id> --from voice --until preview`.

### Bukti (`out/review/p3b/`)
- **`p2-kereta` ([`out/review/p3b/p2-kereta/`](../out/review/p3b/p2-kereta/)):**
  - `preview.mp4`, `contact-sheet.png`, 5 still (`S1`–`S5`), `timeline.json`, `storyboard.json`, `qc/`, `scenes/` (raw & final).
  - **10 panggilan LLM** (S6–S9: `1/3/6/0`), `0` error storyboard, **5/5 adegan lulus** (`S1:0, S2:0, S3:0, S4:0, S5:0` perbaikan), durasi video `38.67s` vs VO `38.68s`, render `33.870 ms`.
- **`p2-mesin4tak` ([`out/review/p3b/p2-mesin4tak/`](../out/review/p3b/p2-mesin4tak/)):**
  - `preview.mp4`, `contact-sheet.png`, 4 still (`S1`–`S4`), `timeline.json`, `storyboard.json`, `qc/`, `scenes/` (raw & final).
  - **13 panggilan LLM** (S6–S9: `2/5/5/1`), `0` error storyboard, **4/4 adegan lulus** (`S1:0, S2:0, S3:1, S4:0` perbaikan), durasi video `37.60s` vs VO `37.614s`, render `30.856 ms`.
- **Statistik & Mutasi:** [`stats.md`](../out/review/p3b/stats.md), [`mutations/mutation-summary.md`](../out/review/p3b/mutations/mutation-summary.md) (**5/5 mutasi tertangkap**: `SB_HUD_NUMBER_NOT_IN_CLAIM`, `SB_MISSING_TRIGGER_WORD`, `SB_HUD_BUDGET`, `SB_UNVERIFIED_CLAIM`, `SYNC_OUT_OF_WINDOW`), dan [`verify.txt`](../out/review/p3b/verify.txt) (UTF-8).

---

## Fase P3C — Kebenaran Teks di Layar (L5), Gate S7 Wajib, & Variasi Shot (`docs/P3C-ONSCREEN-TRUTH.md`)

- **Status:** **DONE**
- **Branch:** `phase/p3b-storyboard-coder` (tindak lanjut `docs/REVIEW-P3B.md`)
- **Tanggal:** 2026-11-20

### Apa yang Diperbaiki & Dibuat (P3C)
1. **HUD Berbasis Data Storyboard & L5 Runtime (`StoryboardHudContext.tsx`, `HudZones.tsx`, `media-checks.ts`, `scene-safety.ts`):**
   - Menambahkan `hud_id`, `when.driver_between`, dan `shot_type`/`camera_move` pada kontrak storyboard (`src/core/contracts/storyboard.ts`).
   - Membuat `<StoryboardHudProvider items={...}>` + `<Hud id="..." driver={...} />` agar teks/nilai HUD hanya berasal dari `storyboard.json` dan otomatis tersembunyi di luar rentang `when.driver_between`.
   - `validateSceneCodeSafety` menolak pemanggilan langsung `<KineticTitle>`, `<Callout>`, `<MeasureReveal>`, `<StatCounter>`, `<CompareCard>`, `<ListReveal>`, `<DimensionLine>` (`UNSANCTIONED_HUD_DIRECT_CALL`).
   - `checkOnscreenTruthFromTelemetry` (layer **`onscreenTruth` L5**) memeriksa setiap elemen HUD yang ter-render di telemetri (`L5_UNSANCTIONED_HUD`, `L5_FACT_MISMATCH`), sementara `checkMechanicsFromTelemetry` memeriksa `MECHANICS_HUD_OUT_OF_PHASE` untuk HUD ber-`when.driver_between`.
   - Normalisasi unit sudut (`deg` → `°` tanpa spasi) via `normalizeUnit` & `formatValueWithUnit`, serta penolakan satuan `"deg"` pada `HUD_UNNORMALIZED_UNIT`.
2. **Gate S7 Wajib & Cek Teks Storyboard Akurat (`src/core/qc/storyboard.ts`, `scene-coder.ts`, `src/cli/p3b.ts`):**
   - `runScenesStage` & CLI memblokir eksekusi S8 jika `project.stages.S7 !== 'done'`.
   - `collectTextValues` hanya memeriksa field teks tampilan (`title`, `subtitle`, `label`, `detail`, `valueText`, `leftTitle`, `leftValue`, `rightTitle`, `rightValue`, `dateText`, `items`, `steps`), tidak memeriksa `hud_id`/`claim_ref`/`shot_type`.
   - Storyboard QC mewajibkan `hud_id`, `shot_type` (minimal 3 jenis `shot_type` berbeda per video & dilarang `(shot_type, focus_entities)` berurutan identik), dan `bind_to_driver` yang merujuk `driver` adegan.
3. **Rakitan Baru & Overlay 2D (`TrainCar.tsx`, `RailCrossSection.tsx`, `EngineBlock.tsx`, `DiagramOverlay.tsx`):**
   - `TrainCar` kini memakai dua bogie `WheelsetOnRail` di sumbu Z + `TelemetryEntity`; ditambahkan `RailCrossSection` (potongan lintang rel & tapak kerucut), `EngineBlock` (blok 4-silinder cutaway), dan `DiagramOverlay` (overlay SVG 2D di dalam `<HudLayout>`).
4. **Ringkasan Teks di Layar (`src/core/stages/preview.ts`):**
   - Menghasilkan `onscreen-text.md` yang memetakan setiap `hud_id` → komponen → teks → `claim_ref`/`driver` → kutipan sumber.

### Bukti (`out/review/p3b/`)
- **`p2-kereta` ([`out/review/p3b/p2-kereta/`](../out/review/p3b/p2-kereta/)):**
  - **11 panggilan LLM** (S6–S9: `1/1/7/2`), `0` error storyboard, **5/5 adegan lulus** (`S1:0, S2:2, S3:0, S4:0, S5:0` perbaikan), durasi video `38.67s` vs VO `38.68s`, render `39.129 ms`, [`onscreen-text.md`](../out/review/p3b/p2-kereta/onscreen-text.md) lengkap (`S1_H1`–`S5_H1`), variasi shot terlihat di [`contact-sheet.png`](../out/review/p3b/p2-kereta/contact-sheet.png).
- **`p2-mesin4tak` ([`out/review/p3b/p2-mesin4tak/`](../out/review/p3b/p2-mesin4tak/)):**
  - **9 panggilan LLM** (S6–S9: `2/1/6/0`), `0` error storyboard, **4/4 adegan lulus** (`S1:0, S2:0, S3:0, S4:0` perbaikan), durasi video `37.60s` vs VO `37.614s`, render `39.168 ms`, [`onscreen-text.md`](../out/review/p3b/p2-mesin4tak/onscreen-text.md) lengkap (`S1_H1`–`S4_H1`), variasi shot terlihat di [`contact-sheet.png`](../out/review/p3b/p2-mesin4tak/contact-sheet.png).
- **Mutasi P3C ([`mutations/mutation-summary.md`](../out/review/p3b/mutations/mutation-summary.md)):** **6/6 mutasi tertangkap lewat render & telemetri sungguhan**:
  - `mut1-unsanctioned-hud` → `onscreenTruth (L5)`: `5` error (`L5_UNSANCTIONED_HUD`)
  - `mut2-fact-mismatch` → `onscreenTruth (L5)`: `3` error (`L5_FACT_MISMATCH`)
  - `mut3-phase-hud` → `mechanics`: `44` error (`MECHANICS_HUD_OUT_OF_PHASE`)
  - `mut4-deg-unit` → `hudFormat`: `1` error (`HUD_UNNORMALIZED_UNIT`)
  - `mut5-shot-variety` → `Storyboard QC`: `5` error (`SB_LOW_SHOT_VARIETY`)
  - `mut6-sync-real-render` → `sync`: `1` error (`SYNC_OUT_OF_WINDOW`)
- **Statistik & Verifikasi:** [`stats.md`](../out/review/p3b/stats.md) & [`verify.txt`](../out/review/p3b/verify.txt) (UTF-8).
