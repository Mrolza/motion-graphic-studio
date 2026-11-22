# P4B — Hemat Kuota, Kamera Pas, Penampang yang Menjelaskan, lalu Video Final

> Fase: **P4B** · Lanjutkan di branch `phase/p4-audio-final` · Baca `docs/AG-RULES.md` (ada aturan baru §6 dan DoD 6–7), **`docs/REVIEW-P4.md`**, dan `docs/P4-AUDIO-FINAL.md` (bagian B, C, mutasi, dan bukti tetap berlaku).
> Urutan: **A → B → C**. Bagian A dan B **tidak boleh memakai panggilan Gemini sungguhan**. Pakai klien LLM tiruan (mock) di test.

## A. Hemat kuota (tanpa Gemini)

**A1. Pencatatan panggilan yang jujur**
- Setiap panggilan logis dicatat di `projects/<id>/llm-calls.jsonl` dengan field `{ts, run_id, stage, purpose, scene_id, attempt, http_retries, ok}`.
- Retry HTTP (503/429) dicatat terpisah dan tidak dihitung sebagai panggilan logis.
- `llm_calls_last_run` direset di awal setiap run (`run_id` baru).

**A2. Batas panggilan per run**
- Batas default **20 panggilan logis per video per run**. Nama env `MGS_LLM_BUDGET_PER_RUN` ditulis di `.env.example`.
- Batas diperiksa sebelum setiap panggilan. Jika terlampaui → berhenti dengan `LLM_BUDGET_EXCEEDED`, state disimpan, dan run bisa dilanjutkan.
- `stats.md` tetap melaporkan total S1–S12 dibanding target PRD (≤ 15).

**A3. Pakai ulang hasil yang sudah lolos**
- Storyboard dipakai ulang jika hash masukannya tidak berubah (naskah, `sentence_ids` timeline, ledger, versi `KIT-API.md`).
- Kode adegan dipakai ulang jika hash (adegan storyboard + versi kit + versi prompt Scene Coder) tidak berubah **dan** QC terakhirnya lolos.
- Run ulang hanya membuat ulang adegan yang gagal atau yang berubah.

**A4. Cek kuota sebelum run**
- Perkirakan panggilan maksimum run (per tahap). Bandingkan dengan sisa kuota di `.mgs/quota.json` dan `GEMINI_RPD_LIMIT` (opsional, di `.env.example`). Jika tidak cukup, run tidak dimulai.
- 429 kuota harian → berhenti seketika tanpa retry. Laporan menyebut kuota pulih pukul 00.00 Pacific (15.00 WIB saat PST).

**A5. Kesalahan milik kit tidak dikirim ke Gemini**
- Setiap error QC diberi `owner: "scene" | "kit"`. Contoh error milik kit:
  - `FRAMING_OUT_OF_BOUNDS` / `VISIBILITY_OUT_OF_BOUNDS` pada adegan yang memakai `CameraRig frameEntities` tanpa parameter manual;
  - pelanggaran geometri di dalam rakitan.
- Error milik kit → **0 panggilan perbaikan S9**. Adegan ditandai `KIT_FAULT` dan run berhenti dengan laporan yang jelas.

## B. Kamera dan penampang (tanpa Gemini)

**B1. `CameraRig frameEntities` peka rasio 9:16**
- Jarak kamera dihitung dari FOV vertikal **dan** horizontal, ditambah padding, sampai target isi tercapai.
- **Matriks framing kit:** render still 720×1280 untuk setiap rakitan (`TrainCar`, `WheelsetOnRail`, `RailCrossSection`, `EngineBlock`, `PistonCrankAssembly`, `Suspension`) pada 3 nilai penggerak. Assert:
  - bbox berada di dalam zona bebas;
  - isi frame memenuhi aturan shot.
- Bukti: `kit-framing/` (contact sheet + tabel bbox/isi dari telemetri).

**B2. `RailCrossSection` v3: penampang untuk layar potret**
- Pandangan depan seluruh wheelset dipaskan ke lebar frame, ortografis, dengan gaya Blueprint (isian datar + garis tepi). Bagian yang tampil: tapak kerucut, flens sisi dalam, kepala rel, gandar.
- Kemiringan tapak dibesarkan **≥ 10×** sehingga sudutnya jelas, dengan badge kit "skala dilebihkan".
- **Titik kontak bergeser:** saat roda bergeser ke satu sisi, titik kontak roda di sisi itu bergerak mendekati flens, dan titik kontak roda seberang menjauhi flens.
- Test telemetri: pergeseran titik kontak di layar ≥ 20 px antara posisi tengah dan geser maksimum, arahnya sesuai, dan simetris di posisi tengah.

**B3. Komponen baru `EffectiveDiameterCompare` (untuk shot perbandingan)**
- Dua roda dilihat dari samping berdampingan, berlabel "Roda luar" dan "Roda dalam". Lingkaran efektif roda luar digambar **lebih besar ≥ 10%** saat geser maksimum, sama besar di posisi tengah, dan tandanya mengikuti arah geser.
- Ada garis jarak tempuh per putaran untuk menggambarkan "roda luar menempuh jarak sedikit lebih jauh" (C3).
- Badge "Ilustrasi — skala dilebihkan". **Tanpa angka.**
- Ganti HUD batang tunggal "Diameter Efektif".

**B4. HUD ringkas**
- Callout maksimal **8 kata dan 2 baris**. Kalimat lengkap ada di narasi dan takarir.
- Prompt S6 diperbarui. QC storyboard memberi peringatan > 8 kata dan error `HUD_TOO_LONG` > 12 kata. Verifier semantik tetap berlaku untuk label pendek.

**B5. Bukti dari komponen yang benar**
- Buat komposisi demo `DemoCrossSection` dari `RailCrossSection` v3 dan `EffectiveDiameterCompare`.
- Still dan tabel di `out/review/p4/cross-section/` **wajib berasal dari render komposisi itu**, dengan angka layar (px) dari telemetri frame, ditambah nilai geometri asli.
- Hapus still lama dari `DemoKereta`.

## C. Video final (dengan Gemini, setelah kuota pulih)
- Jalankan bagian C dari `docs/P4-AUDIO-FINAL.md`:
  - kereta dengan profil Standar;
  - mesin dengan profil Hemat;
  - masing-masing dengan **batas 20 panggilan per run**.
- Jika sebuah adegan gagal karena error milik kit, **jangan jalankan ulang**. Perbaiki kit tanpa Gemini, lalu lanjutkan run (adegan yang lolos dipakai ulang).
- **Jika kuota belum pulih saat A dan B selesai:**
  1. Kerjakan semua mutasi yang tidak butuh Gemini.
  2. Tulis status **PARTIAL — menunggu kuota**.
  3. Berhenti. Pemilik akan memberi perintah lanjutan.

## Mutasi
Mutasi 1–12 dari P4. **Tidak boleh ada mutasi yang memakai panggilan Gemini sungguhan.** Mutasi 1–5 memakai storyboard atau telemetri suntikan; mutasi 6–12 memakai keluaran nyata. Ditambah:

13. Klien tiruan dengan batas 3 → `LLM_BUDGET_EXCEEDED`, lalu run bisa dilanjutkan.
14. Run ulang dengan 1 adegan gagal → hanya adegan itu yang dibuat ulang (jumlah panggilan terbukti dari `llm-calls.jsonl`).
15. Error framing milik kit → 0 panggilan S9, status `KIT_FAULT`.
16. Callout 14 kata → `HUD_TOO_LONG`.

## Bukti (`out/review/p4/`)
- Semua bukti dari P4 tetap berlaku.
- Tambahan:
  - `kit-framing/`;
  - `cross-section/` (dari `DemoCrossSection`);
  - `llm-calls.jsonl` per topik;
  - mutasi 13–16.

## Kriteria lolos
1. `npm run verify` lulus. Test A1–A5 dan B1–B4 memakai klien tiruan atau render sungguhan, bukan sekadar pengecekan keberadaan fungsi.
2. Matriks framing kit lolos untuk semua rakitan.
3. Penampang memperlihatkan kerucut, flens, dan titik kontak yang bergeser. Perbandingan memperlihatkan roda luar lebih besar. Keduanya dibuktikan dengan telemetri dari komponen yang benar.
4. Kriteria 2–7 dari P4. Setiap video memakai ≤ 20 panggilan per run, dan total panggilan tercatat jujur.
5. Mutasi 1–16 gagal dengan error yang tepat.

Catat status di `docs/PROGRESS.md` beserta jumlah panggilan Gemini yang dipakai, commit, push branch, lalu **berhenti**.
