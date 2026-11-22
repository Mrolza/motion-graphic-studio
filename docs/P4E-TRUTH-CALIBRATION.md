# P4E — Kalibrasi Gerbang Fakta, Cakupan, Arah, dan Ejaan

> Fase: **P4E** · Branch: `phase/p4e-truth-calibration` · Baca `docs/AG-RULES.md` dan **`docs/REVIEW-P4D.md`**.
> Tujuan: gerbang fakta **tidak meloloskan** kalimat yang membuang kata lunak, dan **tidak membuang** klaim yang setia. Isi penting (semua langkah proses) tetap ada, panah sesuai gerak, teks tanpa salah ketik. Hasil akhirnya dua video yang layak tayang.
> Urutan: **0 → A → B → C**. Bagian A dan B dikerjakan dengan klien tiruan. Gemini sungguhan hanya di bagian C, maksimal 20 per video per run dan **target total fase ≤ 40 per video**.

## 0. Merge dan snapshot
1. `npm run verify` lulus.
2. Merge `phase/p4d-truth-sync` ke `main` (`--no-ff`), tag `p4d-done`, push.
3. Buat branch `phase/p4e-truth-calibration`.
4. Snapshot "sebelum" (ledger, naskah, storyboard kedua topik) **diambil dari tag `p4d-done`** (`git show p4d-done:<path>`), lalu disimpan di `out/review/p4e/<topik>/before/`.

## A. Kalibrasi gerbang (tanpa Gemini)

**A1. Cek kata lunak di tingkat naskah**
- Kamus hedge yang sama (`hedge-glossary.ts`) diterapkan pada **setiap kalimat naskah** terhadap kutipan semua klaim yang dirujuknya. Error di Gerbang 1: `L2_HEDGE_DROPPED` dan `L2_ABSOLUTE_ADDED`.
- Hal yang sama berlaku untuk `publish.md` dan teks HUD.
- Test wajib: kalimat "roda akan melaju lurus" dengan kutipan "would tend to continue" → error.

**A2. Perbaiki klaim, jangan dibuang**
- Klaim yang gagal L1 karena kata lunak hilang atau isi berlebih **diparafrase ulang dari kutipannya**. Satu panggilan untuk semua klaim yang gagal, maksimal 1 kali ulang, lalu diperiksa lagi.
- Klaim baru ditandai `unverified` jika tetap gagal.
- Setiap klaim `unverified` wajib punya `status_reason` (kode dan penjelasan singkat).

**A3. Selidiki false positive C1/C7 kereta**
- Pakai teks persis C1 dan C7 dari `out/review/p4d/p2-kereta/fact-ledger.json` beserta kutipannya.
- Temukan pemeriksaan yang menolaknya, perbaiki, lalu jadikan **test regresi**: keduanya harus `verified`.

**A4. Cakupan langkah proses (L0b)**
- Untuk topik proses ("cara kerja", "bagaimana dibuat"), konsep S1 berisi daftar `key_steps`.
- Gerbang 1 mewajibkan **setiap langkah dijelaskan minimal 1 kalimat** yang didukung klaim `verified`.
- Jika sebuah langkah tidak punya klaim, riset harus mencarinya (atau memperbaiki parafrasenya lewat A2). Jika tetap tidak ada, gerbang **berhenti** dengan `L0B_STEP_MISSING`, bukan diam-diam melewatkannya.
- Untuk mesin 4 tak, keempat langkah wajib ada.

**A5. Panah terikat gerak**
- Komponen kit `MotionArrow` menurunkan arahnya dari tanda kecepatan bagian yang dirujuk (lewat penggerak), atau dari arah eksplisit yang ditulis di storyboard.
- QC visual membandingkan vektor panah dengan gerak bagian itu selama jendela adegan. Jika berlawanan → error `VIS_ARROW_DIRECTION_MISMATCH`.
- Panah statis tanpa ikatan tidak boleh dipakai untuk gerak.

**A6. Ejaan teks di layar**
- Setiap kata di HUD dan judul dicocokkan dengan daftar kata id-ID (misalnya kamus Hunspell `id_ID`, simpan lisensinya di `THIRD_PARTY_NOTICES.md`), ditambah kata dari topik, naskah, dan ledger.
- Kata tak dikenal di judul → error `TEXT_UNKNOWN_WORD`; di callout → peringatan.
- Test: "Tegelincir" → error.

**A7. Metadata HUD**
`display` harus sesuai dengan yang tampil. `EffectiveDiameterCompare` = `qualitative`.

## B. Hitungan panggilan yang jujur (tanpa Gemini)
- **B1.** Semua panggilan S1–S12 dicatat di `llm-calls.jsonl`, termasuk riset, naskah, Gerbang 1, dan verifier ledger.
- **B2.** `stats.md` menampilkan total **per fase** (difilter dari waktu tag awal fase), ditambah kumulatif sebagai informasi tambahan.
- **B3.** `storyboard_review` di-cache berdasarkan hash storyboard dan versi aturan. Jika tidak berubah, panggilannya 0.
- **B4.** Mutasi 31: tiga run berturut-turut tanpa perubahan → total panggilan run ke-2 dan ke-3 = 0.

## C. Uji ulang end-to-end (dengan Gemini)
- **Mesin:**
  1. Perbaiki ledger dengan A2 sampai klaim kompresi `verified`.
  2. Buat naskah keempat langkah.
  3. TTS ulang kalimat yang berubah.
  4. Lanjutkan S5–S12 (profil Hemat). Panah langkah tenaga menunjuk ke bawah.
- **Kereta:**
  1. C1 harus `verified`, sehingga fakta 1:20 boleh kembali ke naskah.
  2. Naskah lolos A1: kalimat inersia memakai "cenderung".
  3. Judul tanpa salah ketik.
  4. Kalimat pembuka tidak janggal.
  5. Lanjutkan sampai S12 (profil Standar).
- Run ulang hanya boleh dilakukan setelah diagnosis tanpa Gemini (AG-RULES §6).

## Mutasi
24. Kalimat naskah "akan melaju lurus" (kutipan "tend to") → `L2_HEDGE_DROPPED`
25. C1 kereta (teks persis P4D) → harus `verified` (regresi false positive)
26. Klaim kompresi berlebih → diperbaiki A2 menjadi `verified`, tidak dibuang
27. Naskah mesin tanpa kalimat kompresi → `L0B_STEP_MISSING`
28. Panah ke atas saat piston turun → `VIS_ARROW_DIRECTION_MISMATCH`
29. Judul "Tegelincir" → `TEXT_UNKNOWN_WORD`
30. `publish.md` membuang kata lunak → `L2_HEDGE_DROPPED`
31. Tiga run tanpa perubahan → run ke-2 dan ke-3 = 0 panggilan

Mutasi 1–23 dijalankan ulang.

## Bukti (`out/review/p4e/`)
- **Per topik:**
  - `before/` (dari tag `p4d-done`);
  - `ledger-diff.md` dengan `status_reason` untuk setiap klaim `unverified`;
  - `script-diff.md`, `coverage.md` (setiap `key_step` → kalimat → klaim);
  - `final.mp4`, `final-qc.md`, `onscreen-text.md`, `captions.srt`, `publish.md`, `overlap-scan.md`, still per adegan.
- **Mesin:** `arrows.md` (arah panah vs gerak piston per adegan, dari telemetri).
- **Lainnya:** `mutations/` (1–31), `stats.md` (per fase), `verify.txt`.

## Kriteria lolos
1. `npm run verify` lulus.
2. Kedua `final.mp4` berstatus **PASS**.
3. Naskah, HUD, dan `publish.md` tidak memuat kalimat tanpa padanan kata lunak dari kutipannya.
4. Mesin menjelaskan **keempat langkah**. Kereta memuat fakta 1:20 (C1 `verified`).
5. Panah langkah tenaga menunjuk ke bawah (telemetri). Tidak ada kata tak dikenal di judul.
6. Mutasi 1–31 gagal dengan error yang tepat.
7. Panggilan Gemini ≤ 20 per run. Total fase per video dilaporkan jujur, dengan target ≤ 40.

Catat status di `docs/PROGRESS.md` (dengan jumlah panggilan per fase), commit, push branch, lalu **berhenti**.
