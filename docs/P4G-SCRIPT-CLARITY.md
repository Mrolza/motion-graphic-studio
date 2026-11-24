# P4G — Naskah Jelas di Bawah Batasan Fakta, dan Suntingan Pemilik di Gerbang 1

> Fase: **P4G** (kecil) · Branch: `phase/p4g-script-clarity` · Baca `docs/AG-RULES.md` dan **`docs/REVIEW-P4F.md`**.
> Tujuan: naskah yang **setia sumber dan mudah dipahami**, plus jalur bagi pemilik untuk merapikan kalimat sebelum render.
> **Jangan menambah gerbang di luar yang tertulis di sini.** Gemini sungguhan hanya di bagian D, maksimal 20 per run dan ≤ 30 untuk fase ini.

## 0. Merge
1. `npm run verify` lulus.
2. Merge `phase/p4f-domain-safety` ke `main` (`--no-ff`), tag `p4f-done`, push.
3. Buat branch `phase/p4g-script-clarity`.

## A. Kutipan yang jernih (riset)
- Saat memilih kutipan, beri skor setiap kandidat dan pilih yang **berdiri sendiri**. Penalti untuk kutipan yang:
  - diawali kata rujukan (`this`, `that`, `it`, `these`, `at this point`, `the stroke`);
  - berisi asumsi dalam kurung;
  - lebih dari 45 kata;
  - bertentangan dengan dirinya sendiri, misalnya arah `downwards` bersama `BDC to TDC`. Ini dicek dengan aturan arah sederhana: TDC → BDC = turun, BDC → TDC = naik.
- Jika ada beberapa kandidat untuk langkah yang sama, ambil skor terbaik dari halaman berbeda (Four-stroke engine, Otto cycle, versi id.wikipedia).
- Catat skor dan alasan pemilihan di `quote-selection.md`.

## B. Aturan kejelasan naskah (prompt + cek kode)
- **Prompt penulis:**
  - terjemahkan dengan **wajar**, bukan harfiah;
  - **sebut nama langkah** di kalimat yang menjelaskannya;
  - nyatakan **arah gerak** (naik/turun) bila klaim mendukungnya;
  - kalimat ≤ 20 kata;
  - kalimat pembuka dan penutup menjawab pertanyaan topik.
  - Penulis boleh menggabungkan beberapa klaim dalam satu kalimat, asalkan semua klaimnya dirujuk.
- **Cek kode di Gerbang 1:**
  - `L0B_STEP_UNNAMED`: kalimat khusus sebuah langkah tidak memuat nama langkah itu (atau sinonim dari kamus).
  - `L0B_VAGUE_PHRASE` untuk frasa kosong: "dari satu titik ke titik lain", "pada titik tertentu", "hal tersebut" di awal langkah baru, "dan sebagainya".
  - `L0B_DANGLING_REFERENCE`: kalimat langkah baru diawali "Langkah tersebut/ini" tanpa menyebut namanya.
  - Kalimat > 20 kata → peringatan; > 28 kata → error.

## C. Suntingan pemilik di Gerbang 1 (CLI)
- `mgs review <id>` menampilkan naskah per kalimat beserta klaim, kutipan, dan status cek.
- `mgs edit <id> --sentence S3.3 --text "..."` (atau `--file naskah.md`) mengganti teks kalimat.
  - Klaim yang dirujuk tetap sama, kecuali diubah dengan `--claims C4,C9`.
  - Hanya kalimat yang disunting yang diperiksa ulang: L2 hedge, L0b kejelasan, dan verifier L3 (1 panggilan untuk semua kalimat yang disunting).
  - Semua suntingan dicatat di `edits.jsonl` (sebelum, sesudah, waktu).
- `mgs approve <id>` hanya berhasil jika semua cek lolos.
- Setelah naskah disetujui, TTS ulang hanya untuk kalimat yang berubah. S6 dan seterusnya mengikuti cache.

## D. Uji ulang mesin (dengan Gemini)
- Jalankan mesin dari S2 (riset dengan A) → S3 naskah (dengan B) → Gerbang 1 → S5–S12, profil Hemat.
- **Tidak boleh ada suntingan manual dari AG di run ini.** Kami ingin melihat kualitas otomatisnya.
- Demonstrasikan C pada **salinan** proyek (`p2-mesin4tak-edit-demo`):
  - sunting 1 kalimat;
  - tunjukkan bahwa hanya kalimat itu yang diperiksa ulang dan dibuat ulang TTS-nya.

## Mutasi
40. Kalimat "Langkah tersebut menghasilkan kerja mekanis…" sebagai kalimat langkah usaha → `L0B_STEP_UNNAMED` / `L0B_DANGLING_REFERENCE`
41. "piston bergerak dari satu titik ke titik lain" → `L0B_VAGUE_PHRASE`
42. Kutipan "heads downwards… (B.D.C. to T.D.C.)" → skornya kalah dari kutipan yang konsisten
43. Suntingan pemilik yang membuang kata lunak → `L2_HEDGE_DROPPED`, `approve` ditolak
44. Suntingan 1 kalimat → hanya kalimat itu yang dibuat ulang TTS-nya (dibuktikan dengan hash audio kalimat lain tidak berubah)

Mutasi 1–39 dijalankan ulang.

## Bukti (`out/review/p4g/`)
- **Mesin:** `final.mp4`, `final-qc.md`, `quote-selection.md`, `script.md` (naskah lengkap per kalimat dengan klaim dan kutipan), `coverage.md`, `onscreen-text.md`, `publish.md`, still per adegan.
- **Demo suntingan:** `edit-demo/` (`edits.jsonl`, hasil `mgs review` sebelum/sesudah, hash audio per kalimat).
- **Lainnya:** `mutations/` (1–44), `stats.md` (per fase), `verify.txt`.

## Kriteria lolos
1. `npm run verify` lulus. `final.mp4` mesin berstatus **PASS**.
2. Narasi mesin **menyebut keempat nama langkah**, menyatakan arah piston di setiap langkah, dan tidak memuat frasa kosong. Kalimat penutup menjawab pertanyaan topik. Saya akan menilainya dengan mendengarkan langsung.
3. Semua kalimat tetap didukung kutipan, dengan kata lunak terjaga.
4. Demo suntingan bekerja: hanya kalimat yang disunting diperiksa dan dibuat ulang.
5. Mutasi 1–44 gagal dengan error yang tepat. Gemini ≤ 20 per run dan ≤ 30 untuk fase ini.

Catat status di `docs/PROGRESS.md` (dengan panggilan per fase), commit, push branch, lalu **berhenti**.
