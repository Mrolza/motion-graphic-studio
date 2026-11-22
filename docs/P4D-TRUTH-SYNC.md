# P4D — Narasi Setia Sumber, Layar Sinkron, Cache Jujur

> Fase: **P4D** · Branch: `phase/p4d-truth-sync` · Baca `docs/AG-RULES.md` dan **`docs/REVIEW-P4C.md`**.
> Tujuan: video kereta layak tayang dan video mesin rapi. Narasi, takarir, HUD, dan deskripsi harus setia pada **kutipan sumber**, tidak saling bertabrakan, dan diperiksa ulang setiap kali kit atau aturan QC berubah.
> Urutan: **0 → A → B → C → D**. Bagian A–C dikerjakan dengan klien tiruan. Panggilan Gemini sungguhan hanya untuk bagian D, maksimal 20 per video per run.

## 0. Merge
1. `npm run verify` lulus.
2. Merge `phase/p4-audio-final` ke `main` (`--no-ff`), tag `p4-done`, push.
3. Buat branch `phase/p4d-truth-sync`.

## A. Ledger setia pada kutipan

**A1. Pemeriksaan kode L1 untuk parafrase klaim**
- Jika kutipan mengandung kata lunak (`most`, `about`, `approximately`, `less chance`, `tend to`, `may`, `usually`, `often`, `some`), teks klaim wajib memuat padanannya, misalnya `sebagian besar`, `sekitar`, `peluang lebih kecil`, `cenderung`, `bisa`, `umumnya`, `sering`, `beberapa`. Kamus padanan disimpan di satu file. Jika tidak ada → error `L1_HEDGE_DROPPED`.
- Kata mutlak (`tanpa`, `selalu`, `tidak pernah`, `pasti`, `terus-menerus`, `semua`) di teks klaim yang tidak didukung kutipan → error `L1_ABSOLUTE_ADDED`. Pengecualian: "tanpa" boleh dipakai jika kutipannya memang memuat "without" untuk hal yang sama.

**A2. Verifier semantik untuk ledger**
- Semua klaim dalam satu ledger diperiksa dalam **1 panggilan**: parafrase vs kutipan.
- Kategori: `L1_EMBELLISHED` (menambah isi yang tidak ada di kutipan, seperti C8 mesin) dan `L1_HEDGE_DROPPED`.

**A3. Gerbang 1 membandingkan naskah dengan kutipan**
- Verifier L3 menerima **kutipan asli** dari setiap klaim yang dirujuk, bukan hanya parafrasenya.
- Tunjukkan baris kode yang berubah di laporan.

**A4. Klaim tidak terverifikasi tidak boleh dipakai**
- Klaim `unverified` (misalnya C4 kereta dengan URL `https://wikipedia.org`) tidak boleh dirujuk naskah, storyboard, atau `publish.md`. Tambahkan test untuk aturan ini.

## B. Layar sinkron

**B1. Cek takarir vs HUD pada render final**
- Sampling telemetri bbox **yang benar-benar dirender** (termasuk callout multi-baris) setiap ≤ 5 frame di seluruh video.
- `CAPTION_HUD_OVERLAP` masuk QC final sebagai error.
- **Test regresi:** `final.mp4` kereta yang sekarang wajib **FAIL** di sekitar detik 7, 12, 17, dan 22.

**B2. Tata letak eksklusif**
- Zona HUD dan zona takarir tidak boleh beririsan.
- Callout dibatasi maksimal 2 baris saat render, mengikuti aturan ≤ 8 kata di storyboard.
- `StatCounter` dan panel kit tidak boleh diletakkan di zona takarir.

**B3. Narasi vs HUD tidak boleh bertentangan**
- Jika HUD dan kalimat narasi yang tampil bersamaan merujuk klaim yang sama, dan salah satunya memakai kata mutlak sementara yang lain memakai kata lunak → error `L5_NARRATION_HUD_CONFLICT`.

**B4. Tidak ada teks ganda**
- KineticTitle atau callout yang ≥ 70% kata-katanya sama dengan takarir yang tampil bersamaan → peringatan `HUD_DUPLICATES_CAPTION`.
- Saat judul ringkasan tampil, takarir disembunyikan, atau judul dipersingkat menjadi ≤ 6 kata.

**B5. Kutipan HUD lengkap**
- Teks HUD yang mencakup beberapa langkah atau klaim wajib mencantumkan semua `claim_refs`-nya.
- Verifier memeriksa teks terhadap semua kutipan yang dirujuk. Contoh: "Hisap & Kompresi" → C2 + C3, "Tenaga & Buang" → C9 + C5.

## C. Cache dan laporan yang jujur

**C1. Hash cache mencakup semua yang memengaruhi hasil**
- Isi hash: isi `KIT-API.md` (dibuat ulang otomatis saat `verify` atau `prebuild`), `QC_RULES_VERSION`, versi prompt, dan ledger.
- Perubahan kit atau aturan → storyboard dan adegan terkait dibuat ulang.

**C2. QC final menjalankan ulang semua pemeriksaan kode**
- Termasuk QC storyboard, L5 kode, takarir, dan B3/B4, **selalu**, walaupun artefaknya dipakai ulang.
- Hanya hasil pemeriksaan LLM yang boleh dipakai ulang jika hash-nya sama.

**C3. `stats.md` per fase**
- Total panggilan dari `llm-calls.jsonl` untuk semua run di fase ini: jumlah run, per tahap, maksimum per run.
- Waktu render diukur dari render sungguhan. Jika chunk dipakai ulang, tulis "dipakai ulang", bukan 0 ms.

**C4. Verifier semantik S7 = 1 panggilan per versi storyboard**
- Selidiki mengapa mesin mencatat 5 panggilan per run. Perbaiki, lalu buktikan lewat test dengan klien tiruan.

**C5. Format piksel**
- Video final memakai `yuv420p`. QC final memberi error `FINAL_PIXFMT` jika bukan.

## D. Uji ulang end-to-end (dengan Gemini)
- **Kereta:**
  1. Perbaiki ledger lewat pipeline (S2 → S3 → S4 Gerbang 1), jangan diedit manual.
  2. Buat TTS ulang **hanya untuk kalimat yang berubah**.
  3. Lanjutkan S5–S12. Storyboard wajib dibuat ulang: S4 memakai `EffectiveDiameterCompare`.
- **Mesin:** perbaiki ledger C8 lewat pipeline, lalu lanjutkan sampai S12 dengan profil Hemat.
- Batas: ≤ 20 panggilan per video per run. Laporkan total panggilan fase ini.

## Mutasi
17. Klaim "tanpa flens bergesekan" (kutipan: "less chance") → `L1_HEDGE_DROPPED`
18. Klaim tanpa padanan "tend to" → `L1_HEDGE_DROPPED`
19. `final.mp4` kereta lama → QC final **FAIL** `CAPTION_HUD_OVERLAP`
20. Storyboard lama dengan `QC_RULES_VERSION` baru → divalidasi ulang → `HUD_TOO_LONG`
21. HUD "tanpa" + narasi "peluang lebih kecil" (klaim sama, waktu sama) → `L5_NARRATION_HUD_CONFLICT`
22. Video `yuvj420p` → `FINAL_PIXFMT`
23. Naskah merujuk klaim `unverified` → error

Mutasi 1–16 dijalankan ulang (non-LLM dan render nyata).

## Bukti (`out/review/p4d/`)
- **Per topik:**
  - `final.mp4`, `final-qc.json` dan `final-qc.md`;
  - `ledger-diff.md` (klaim sebelum/sesudah dengan kutipan), `script-diff.md` (kalimat narasi yang berubah);
  - `onscreen-text.md` (dengan semua `claim_refs`), `captions.srt`, `publish.md`;
  - `overlap-scan.md` (hasil sampling bbox takarir vs HUD di seluruh video);
  - still per adegan.
- **Lainnya:** `mutations/` (1–23), `stats.md` (per fase), `verify.txt`.

## Kriteria lolos
1. `npm run verify` lulus.
2. Kedua `final.mp4` berstatus **PASS** dengan pemeriksaan baru.
3. Narasi, takarir, HUD, dan `publish.md` kereta tidak lagi memuat "tanpa flens bergesekan" atau "terus melaju lurus" tanpa kata lunak.
4. `overlap-scan.md` menunjukkan 0 tumpukan takarir–HUD di kedua video.
5. S4 kereta memakai `EffectiveDiameterCompare`. Callout ≤ 8 kata (warning) dan tidak ada yang > 12 kata.
6. Mutasi 1–23 gagal dengan error yang tepat.
7. Panggilan Gemini ≤ 20 per video per run, dan total per fase dilaporkan.

Catat status di `docs/PROGRESS.md` beserta jumlah panggilan Gemini, commit, push branch, lalu **berhenti**.
