# P4 — Akurasi Teks di Layar, Audio, dan Video Final

> Fase: **P4** · Branch: `phase/p4-audio-final` · Baca `docs/AG-RULES.md`, `docs/PRD.md` (bagian 5, 8, 13), **`docs/REVIEW-P3C.md`**.
> Tujuan: **video final pertama yang siap unggah**, yaitu `final.mp4` untuk kereta dan mesin yang lolos semua kriteria PRD §13. Video harus punya teks di layar yang tidak melebihi sumber, takarir (caption) yang sinkron, audio −14 LUFS tanpa jeda mati, dan daftar sumber.
> Urutan wajib: **0 → A → B → C**. Bagian C (render final) hanya boleh jalan setelah A dan B lulus test.

## 0. Merge P3B
1. Di `phase/p3b-storyboard-coder`: `npm run verify` lulus → merge ke `main` (`--no-ff`), tag `p3b-done`, push.
2. Branch `phase/p4-audio-final` dari `main`, tag `p4-start`.

## A. Akurasi teks di layar (tindak lanjut REVIEW-P3C)

**A1. HUD yang terikat penggerak (`bind_to_driver`)**
- Setiap HUD driver wajib menyatakan `quantity` (misalnya `crank_angle`, `lateral_shift`, `progress`) dan `display: "value" | "qualitative"`.
- `display: "value"` (angka + satuan) hanya boleh dipakai jika rentang penggerak didukung klaim. Contohnya sudut engkol 0–720° per siklus, yang didukung klaim "dua putaran poros engkol". Klaim itu ditulis di `claim_ref`.
- Tanpa dukungan klaim, HUD wajib `qualitative`: panah, batang, atau label perbandingan tanpa angka.
- Label wajib menyebut besaran penggeraknya. Siapkan kamus `quantity` → istilah id-ID yang sah, misalnya `crank_angle` → "Sudut Poros Engkol" dan `lateral_shift` → "Geser Lateral".
- Error baru:
  - `L5_DRIVER_LABEL_MISMATCH`: label tidak sesuai besaran;
  - `L5_UNSOURCED_DRIVER_VALUE`: angka tampil tanpa klaim pendukung.
- Kereta S4: diameter efektif ditampilkan **kualitatif** (lihat A3), merujuk C3, tanpa angka mm.

**A2. L5 semantik: makna teks tidak boleh melebihi kutipan**
- Setelah S7, jalankan verifier L3 (yang sudah ada untuk naskah) pada **semua teks HUD storyboard**. Semua teks digabung dalam **1 panggilan per video**; setiap teks dikirim bersama kutipan klaimnya. Untuk teks ilustratif, kirim pertanyaan/topik video.
- Kategori error:
  - `L5_SEMANTIC_OVERSTATEMENT`, misalnya "less chance" ditulis menjadi "tanpa";
  - `L5_SEMANTIC_DROPPED_CONDITION`, misalnya syarat "tanpa bentuk kerucut" atau kata "cenderung" hilang;
  - `L5_SEMANTIC_UNSUPPORTED`, misalnya "Kontinu";
  - `L5_OFF_TOPIC_TITLE`, misalnya "Stabilitas Rel Kereta".
- Pra-cek kode: kata mutlak di HUD (`tanpa`, `selalu`, `tidak pernah`, `pasti`, `kontinu`, `semua`) yang dipadukan dengan kata lunak di kutipan (`about`, `less`, `tend`, `most`, `may`, `usually`, `some`) memberi peringatan `L5_ABSOLUTE_WORD`. Peringatan ini dikirim sebagai petunjuk ke verifier.
- Error semantik memicu penulisan ulang storyboard; ini dihitung sebagai jatah 1 kali penulisan ulang. Jika masih error, pipeline berhenti.

**A3. Penampang sungguhan — `RailCrossSection` direvisi**
- Kamera menghadap searah rel, ortografis atau setara. Roda tampil sebagai **profil irisan** dengan tapak kerucut, flens di sisi dalam, kepala rel, dan gandar.
- Di shot `cross_section`, `taperExaggeration` minimal 5. Setiap nilai > 1 wajib menampilkan badge **"skala dilebihkan"** dari kit. Jika badge tidak ada → error `VIS_EXAGGERATION_UNLABELED`.
- Titik kontak roda–rel dan **garis jari-jari efektif** di kedua roda dihitung dari geometri yang sama, bukan nilai tetap. Test telemetri: saat roda bergeser ke rel luar, jari-jari roda luar > jari-jari roda dalam di frame sampel.
- QC kode memetakan `shot_type` ke pandangan wajib:
  - `cross_section` → komponen dengan `view: "section"`;
  - `establishing` → objek konteks (`train_car` atau `engine_block`).
  - Jika tidak sesuai → error `SHOT_VIEW_MISMATCH`.

**A4. Framing shot pembuka dan penutup**
- Untuk `establishing` dan `summary`, objek fokus wajib mengisi ≥ 30% area bebas. Jika kurang → error, bukan peringatan. Shot lain tetap memakai peringatan di 20%.
- `CameraRig mode="frameEntities"` menyetel jarak kamera otomatis ke target isi. Kode adegan tidak boleh menyetel jarak kamera manual.

## B. Audio, takarir, dan render final

**B1. S5: rapatkan jeda VO**
- Jeda > 0,4 detik dipangkas dari audio yang ada, **tanpa TTS ulang**: jeda antarkalimat menjadi 0,20–0,25 detik dan jeda koma menjadi ≤ 0,3 detik. Sisakan bantalan 30–50 ms agar ujung kata tidak terpotong.
- Geser semua timestamp kata dan hitung ulang durasi adegan.
- Storyboard dan adegan merujuk `sentence_ids` dan kata pemicu, **bukan detik**, supaya perubahan timing tidak membutuhkan panggilan LLM baru.
- Test pada VO kereta yang ada: jeda maksimum ≤ 0,4 detik. Buat tabel jeda sebelum dan sesudah. Pada 5 kata sampel, energi suara harus tetap berada di dalam rentang waktu kata.

**B2. `useTrigger`**
- Hook kit `useTrigger(kata | hud_id)` mengembalikan frame lokal mulai kata itu dari timeline.
- Waktu mulai gerak dan munculnya HUD wajib memakai hook ini.
- Validator S9 memberi peringatan `SC_LITERAL_TIMING` untuk ambang frame literal > 6. QC `sync` tetap menjadi gerbang keras.

**B3. Takarir kinetik dari timeline**
- Pakai `captions.ts` hasil salinan. Setiap potongan berisi 2–5 kata, maksimal 2 baris, dengan kata aktif disorot tepat pada waktunya.
- Teks yang tampil adalah teks tampilan naskah. Jika `spoken_text` berbeda, petakan rentang token ucapan ke token tampilan.
- Buat satu `layout-zones.ts` untuk 9:16 yang memuat zona judul, HUD, takarir, dan area aman platform. Jangan taruh teks penting di ±20% bawah dan ±15% kanan, karena area itu tertutup UI Shorts/Reels.
- Pindahkan zona HUD agar tidak bertabrakan dengan takarir. Catat angka zona di `DECISIONS.md` beserta `zones-overlay.png`.
- QC `captions`:
  - `CAPTION_TEXT_MISMATCH`: teks dinormalisasi ≠ narasi;
  - `CAPTION_DESYNC`: selisih > 50 ms dari waktu kata;
  - `CAPTION_HUD_OVERLAP`: berdasarkan kotak telemetri;
  - `CAPTION_UNSAFE_AREA`;
  - `CAPTION_TOO_LONG`.
- Ekspor juga `captions.srt`.

**B4. S11 Mix audio (`audio-mix.ts` hasil salinan)**
- **VO** adalah trek utama.
- **SFX:** whoosh di pergantian adegan dan tick halus saat HUD muncul. Waktunya diambil dari event storyboard/timeline, bukan dari LLM, dan volumenya jauh di bawah VO. Pakai hanya file di `remotion/public/sfx` yang lisensinya tercatat di `THIRD_PARTY_NOTICES.md`. Jika lisensi tidak jelas, jangan dipakai dan laporkan.
- **BGM** opsional, hanya jika ada file berlisensi di `assets/bgm/`. Volume BGM diturunkan ≥ 12 dB saat VO bicara (ducking).
- Jangan mengunduh aset baru di fase ini.
- Loudnorm dua tahap: **−14 ± 1 LUFS integrated, true peak ≤ −1,5 dBTP**, 48 kHz.
- Keluaran: `mix.wav` dan stem (`vo.wav`, `sfx.wav`, `bgm.wav` jika ada).

**B5. S10 Render final bertahap (chunk) sesuai profil**
- Render video **tanpa audio** per chunk (`frameRange`). Ukuran chunk, `concurrency`, dan `gl` diambil dari profil perangkat.
- Gabungkan chunk dengan concat ffmpeg (copy), lalu mux `mix.wav` **satu kali** agar tidak ada celah audio di batas chunk.
- Jika dijalankan ulang, chunk yang sudah ada dan jumlah frame-nya benar dilewati.
- Total frame wajib tepat sama dengan durasi × 30.
- Encoder Remotion tetap default. QSV/NVENC hanya dipakai untuk langkah ffmpeg milik kita, dan hanya jika terdeteksi `mgs doctor` serta lolos uji encode singkat. Catat encoder yang dipakai.
- Catat waktu per tahap: render frame, concat, mix, dan mux.

**B6. S12 QC final — `src/core/qc/final.ts` → `final-qc.json` + `final-qc.md`**
- **Teknis:**
  - resolusi sesuai profil, 30 fps konstan, h264 yuv420p, AAC 48 kHz;
  - durasi 30–60 detik;
  - selisih durasi stream audio dan video ≤ 50 ms;
  - jumlah frame tepat.
- **Audio:**
  - loudness dan true peak seperti B4;
  - jeda di stem VO ≤ 0,4 detik;
  - `silencedetect` (−45 dB, 0,4 detik) pada mix: 0 temuan.
- **Visual:**
  - `blackdetect` (≥ 0,1 detik): 0 temuan;
  - `freezedetect` > 1,5 detik → peringatan.
- **Fakta:** gabungkan semua laporan QC (Gerbang 1, storyboard, visual per adegan termasuk L5 dan L5 semantik, takarir). Satu error saja → **FAIL**.
- **Proses:** total panggilan LLM S1–S12 dan waktu render per video. Beri tanda jika > 15 panggilan (PRD §5).
- `mgs run` berhenti saat FAIL.

**B7. `publish.md` (hanya jika PASS)**
- Isi:
  - usulan judul;
  - deskripsi 2–3 kalimat dari naskah, **tanpa klaim baru**;
  - **daftar sumber** (judul halaman, URL, tanggal akses) dari ledger;
  - kredit: suara TTS, SFX/BGM dan lisensinya, font OFL, Remotion;
  - catatan: "Narasi memakai suara sintetis (TTS); visual adalah animasi kode."
- Cek kode: setiap URL harus ada di ledger. Jika tidak → error `PUBLISH_UNKNOWN_SOURCE`.

CLI: `mgs mix <id>`, `mgs render <id> --final [--profile]`, `mgs qc-final <id>`. `mgs run` berjalan sampai S12.

## C. Uji ulang end-to-end
- Kedua topik dijalankan dari S5 (rapatkan VO yang ada) → S6 storyboard dengan aturan baru → S7–S9 → S10 final → S11 → S12.
- **Kereta** dirender dengan profil **Standar**. **Mesin** dirender dengan profil **Hemat** (swangle), sebagai bukti video tetap bisa dibuat tanpa GPU.

## Mutasi (semua pada keluaran sungguhan)
1. HUD "Diameter Efektif" terikat `lateral_shift` → `L5_DRIVER_LABEL_MISMATCH`
2. HUD "8 mm" dari penggerak tanpa klaim → `L5_UNSOURCED_DRIVER_VALUE`
3. HUD "tanpa flens bergesekan" (kutipan: "less chance") → `L5_SEMANTIC_OVERSTATEMENT`
4. Shot `cross_section` dengan wheelset perspektif (S2 lama) → `SHOT_VIEW_MISMATCH`; exaggeration 5 tanpa badge → `VIS_EXAGGERATION_UNLABELED`
5. Establishing dengan kereta mengisi 15% → `FRAMING_TOO_SMALL` (error)
6. Satu kata takarir diubah → `CAPTION_TEXT_MISMATCH`
7. Takarir menimpa HUD → `CAPTION_HUD_OVERLAP`
8. Mix di −20 LUFS → `FINAL_LOUDNESS`
9. Sisipkan jeda 0,8 detik di VO → `FINAL_DEAD_AIR`
10. Sisipkan 0,5 detik frame hitam → `FINAL_BLACK_FRAMES`
11. Satu chunk kurang frame → `FINAL_FRAME_COUNT`
12. `publish.md` berisi URL di luar ledger → `PUBLISH_UNKNOWN_SOURCE`

## Bukti (`out/review/p4/`)
- **Per topik:**
  - `final.mp4`, `final-qc.json` dan `final-qc.md`, `loudness.txt` (ringkasan ebur128);
  - `timeline-gaps.md` (jeda sebelum/sesudah), `storyboard.json`;
  - `onscreen-text.md` dengan **putusan semantik per teks**;
  - `captions.srt`, `publish.md`, contact sheet, 1 still per adegan.
- **`cross-section/`:** 3 still `RailCrossSection` pada 3 nilai geser, beserta nilai jari-jari dari telemetri.
- **Lainnya:** `zones-overlay.png`, `mutations/` (1–12), `stats.md` (panggilan LLM per tahap S1–S12, penulisan ulang, waktu per tahap, profil, encoder), `verify.txt` (UTF-8).

## Kriteria lolos
1. `npm run verify` lulus.
2. Kedua `final.mp4` berstatus **PASS** di QC final, termasuk semua kriteria teknis PRD §13.
3. 0 error L5 (termasuk semantik). Tidak ada angka penggerak tanpa sumber. Tidak ada teks dari tabel Temuan 2 REVIEW-P3C yang tersisa dalam bentuk yang sama.
4. Penampang kereta memperlihatkan kerucut, flens, dan perbedaan jari-jari efektif.
5. Mutasi 1–12 gagal dengan error yang tepat.
6. Video mesin berhasil dirender dengan profil Hemat.
7. `publish.md` lengkap dan semua sumbernya berasal dari ledger.

Jika waktu atau kuota habis, prioritaskan **A selesai penuh** dan tulis PARTIAL beserta bagian yang belum. Catat status di `docs/PROGRESS.md`, commit, push branch, lalu **berhenti**.
