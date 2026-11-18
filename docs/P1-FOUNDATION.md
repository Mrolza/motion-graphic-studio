# P1 — Fondasi

> Fase: **P1** · Branch: `phase/p1-foundation` · Baca dulu `docs/AG-RULES.md`, `docs/PRD.md`, `docs/REVIEW-P0.md`, `docs/REVIEW-P0B.md`.
> Tujuan: kerangka repo yang bersih, modul teruji dari content-studio, kontrak data untuk seluruh pipeline, dan CLI dasar. **Belum ada UI web dan belum ada panggilan pipeline ke Gemini** (kecuali smoke test opsional di langkah 5).

## 0. Merge spike (disetujui pemilik)
1. Checkout `main`, merge `phase/p0b-generalize` dengan `--no-ff` (pesan: `merge: P0 + P0b spikes`). Branch ini sudah memuat P0.
2. Tag `p0-done`, push `main` dan tag.
3. Buat branch `phase/p1-foundation` dari `main`, tag `p1-start`.

## 1. Struktur repo
```
/                       package utama (Node + TypeScript strict)
├─ src/core/            inti mesin, TIDAK boleh mengimpor dari UI
│  ├─ contracts/        skema zod + tipe (bagian 3)
│  ├─ llm/              klien Gemini: retry, timeout, kuota, penghitung panggilan
│  ├─ research/         wikimedia, commons (salinan), wikipedia (P2)
│  ├─ audio/            tts, audio-mix (salinan)
│  ├─ timeline/         timeline (salinan)
│  ├─ assets/           providers, cache, quota (salinan)
│  ├─ render/           captions (salinan); runner Remotion menyusul di P4
│  ├─ device/           deteksi profil perangkat (bagian 4)
│  └─ project/          penyimpanan proyek berbasis folder
├─ src/cli/             entry CLI `mgs`
├─ remotion/            package Remotion terpisah (kit + komposisi)
│  └─ src/kit/          Scene Kit dari spike (dipindahkan dengan git mv)
├─ archive/spike/       sisa skrip spike, tidak ikut build
├─ tests/
└─ projects/            data proyek (gitignored)
```
- Pindahkan `spike/src/kit/` ke `remotion/src/kit/` dengan `git mv` (riwayat tetap). Sisa `spike/` dipindahkan ke `archive/spike/`. Pastikan render contoh dari kit masih jalan setelah pindah (1 still).
- Versi paket Remotion, `three`, `@react-three/fiber`, dan React ikut versi yang terbukti di spike (`metrics.md` P0).
- Package utama dan `remotion/` masing-masing punya `tsconfig` sendiri; `tsc --noEmit` wajib 0 error di keduanya.

## 2. Salin modul dari content-studio (`D:\content-studio`)
| Modul sumber | Tujuan | Catatan |
|---|---|---|
| `lib/media/tts.ts` + test | `src/core/audio/tts.ts` | Timing kata dari msedge-tts |
| `lib/media/audio-mix.ts` + test | `src/core/audio/audio-mix.ts` | −14 LUFS terbukti |
| `lib/media/timeline.ts` + test | `src/core/timeline/timeline.ts` | |
| `lib/render/captions.ts` + test | `src/core/render/captions.ts` | |
| `lib/media/quota.ts`, `cache.ts` + test | `src/core/assets/` | |
| `lib/media/providers.ts` + test | `src/core/assets/providers.ts` | Jalur aset API; buang bagian yang terikat ke executor lama |
| `lib/research/wikimedia.ts`, `commons.ts` + test | `src/core/research/` | |
| `lib/engine/gemini-config.ts` + logika retry/timeout/kuota dari `lib/engine/executor.ts` | `src/core/llm/` | **Jangan salin `executor.ts`.** Ambil hanya fungsi yang dibutuhkan dan tulis ulang sebagai modul kecil |
| font OFL `remotion/public/fonts/`, SFX `public/sfx/` | `remotion/public/` | Salin juga file lisensi dan entri `THIRD_PARTY_NOTICES.md` |

Aturan penyalinan:
- **Jangan menyalin `.env.local`, `data/`, `public/storyboard/`, atau `app/`.**
- Kalau sebuah modul mengimpor sesuatu dari `executor.ts`, `page.tsx`, atau Supabase, putuskan impor itu: pindahkan fungsi kecil yang dibutuhkan ke `src/core`, atau hapus bagian yang tidak relevan. Catat di `docs/DECISIONS.md`.
- Test yang ikut disalin harus lulus. Test yang butuh jaringan dibuat memakai mock; kalau tidak bisa, tandai `skip` dengan alasan.
- FFmpeg/ffprobe: pakai `@ffmpeg-installer/ffmpeg` (sama seperti content-studio) ditambah `@ffprobe-installer/ffprobe`, supaya `ffprobe` tidak bergantung pada PATH. Catat lisensi binary di `THIRD_PARTY_NOTICES.md`.

## 3. Kontrak data (`src/core/contracts/`)
Tulis skema **zod** dan tipe TypeScript untuk semua artefak pipeline (PRD bagian 5 dan 6). Kontrak boleh berkembang di fase berikutnya, tapi bentuk dasarnya ditetapkan sekarang:

- **`Project`**: `id`, `created_at`, `topic`, `format` (`how_it_works | how_its_made | technical | what_if | today_in_history`), `style` (`blueprint | isometric | map_archive`), `palette`, `target_duration_sec`, `device_profile`, `stages` (status per tahap S1–S12: `pending | running | done | failed | needs_review`), `llm_calls` (jumlah per tahap).
- **`FactLedger`**: persis seperti PRD 6.1 (`claims[]` dengan `id`, `text`, `value?`, `unit?`, `kind`, `status`, `sources[]` berisi `url`, `title`, `quote`, `retrieved_at`).
- **`Script`**: `scenes[]` → `sentences[]` dengan `text`, `claim_refs[]` (boleh kosong hanya untuk kalimat non-faktual yang ditandai `non_factual: true`), `emphasis_words[]`.
- **`Storyboard`**: `scenes[]` dengan:
  - `id`, `lane` (`code_2d | code_3d | code_asset`), `duration_sec`, `sentence_refs[]`;
  - `focus_entities[]` (nama entitas yang wajib terlihat di layar);
  - `driver` (opsional): `{ name, unit, from, to }`, misalnya sudut engkol 0→360°;
  - `invariants[]` (opsional): aturan yang dicek QC mekanis, misalnya `{ entity: "intake_valve", state: "open", when: { driver_between: [0, 180] } }`;
  - `hud[]`: `{ component, props, claim_ref?, bind_to_driver? }`; angka di HUD wajib punya `claim_ref` **atau** `bind_to_driver`, **atau** label `illustrative: true`;
  - `trigger_words[]`: kata narasi yang memicu gerakan.
- **`Timeline`**: ikuti bentuk keluaran modul `timeline.ts` yang disalin.
- **`QcReport`**: `layer` (`L0`–`L5`, `mechanics`, `framing`, `technical`), `issues[]` dengan `severity` (`error | warning`), `message`, `ref`.

Sertakan **fixture contoh** yang valid dan tidak valid untuk setiap skema (topik kereta dari spike boleh dipakai), beserta test yang membuktikan skema menerima yang valid dan menolak yang tidak valid.

## 4. Profil perangkat (`src/core/device/`)
- Deteksi CPU, RAM, GPU (vendor dan nama), dan ketersediaan NPU kalau bisa dibaca tanpa dependensi berat. Kalau NPU tidak bisa dideteksi dengan andal, catat sebagai `unknown`.
- Benchmark singkat: render adegan contoh dari kit (3 detik, 720×1280) dengan `angle` dan `swangle`, pakai kode benchmark dari spike.
- Tetapkan profil `hemat | standar | penuh` sesuai PRD bagian 8, lalu simpan ke `.mgs/device-profile.json`, berisi hasil benchmark dan alasan pemilihan profil. Tambahkan `.mgs/` ke `.gitignore`.
- Profil bisa ditimpa manual lewat CLI.

## 5. Klien LLM (`src/core/llm/`)
- Fungsi `generateJson<T>(schema, prompt, opts)`: memanggil Gemini, memvalidasi keluaran dengan skema zod, retry untuk error sementara (timeout, 429 per menit, 503), berhenti cepat untuk kuota harian habis, dan mencatat setiap panggilan (tahap, durasi, token kalau tersedia) ke proyek.
- Model dari env `GEMINI_MODEL` (default `gemini-3.5-flash-lite`). Ambil key dari env proses; **jangan membaca `.env.local` sebagai file**. Gunakan mekanisme pemuatan env yang standar.
- Test dengan `fetch` di-mock: sukses, JSON tidak valid → retry dengan pesan error, 503 → retry, kuota harian → berhenti, timeout.
- Opsional: satu smoke call nyata dengan prompt kecil. Kalau dijalankan, catat hasilnya; kalau tidak, tulis NOT RUN (bukan kegagalan).

## 6. CLI (`npm run mgs -- <perintah>`)
- `doctor`: cek env yang dibutuhkan (**hanya ada/tidak, jangan tampilkan nilai**), FFmpeg/ffprobe, Chromium Remotion, lalu jalankan deteksi profil perangkat.
- `new --topic "..." --format <format> --style <style>`: membuat `projects/<id>/project.json` yang valid terhadap skema.
- `status <id>`: menampilkan status tahap dan jumlah panggilan LLM.
- `profile --set <hemat|standar|penuh>`: menimpa profil.

## 7. Penjaga struktur
- Skrip `npm run check:size`: gagal kalau ada file sumber > 400 baris (file adegan di `remotion/src/scenes/` > 300 baris), kecuali fixture dan file hasil generate.
- Test batas modul: tidak ada file di `src/core/` yang mengimpor dari `src/cli/`, `src/app/`, atau `remotion/`.
- `npm run verify`: menjalankan `tsc` (kedua package), semua test, `check:size`, dan test batas modul sekaligus.

## Bukti (`out/review/p1/`)
- `verify.txt`: keluaran lengkap `npm run verify`.
- `doctor.txt` dan salinan `device-profile.json`.
- `tree.txt`: struktur folder (tanpa `node_modules`).
- `sample-project.json`: hasil `mgs new`.
- `kit-still.png`: still dari kit setelah dipindah ke `remotion/`.
- `copied-modules.md`: daftar modul yang disalin, perubahan yang dilakukan, dan jumlah test per modul.

## Kriteria lolos
1. Spike sudah di-merge ke `main` dengan tag `p0-done`.
2. `npm run verify` lulus penuh.
3. Semua modul di bagian 2 tersalin dan test-nya lulus (atau `skip` dengan alasan yang jelas).
4. `mgs doctor`, `mgs new`, `mgs status`, dan `mgs profile` berjalan dan hasilnya ada di bukti.
5. Kit di `remotion/` masih bisa merender still.
6. Tidak ada nilai rahasia di log, bukti, atau commit.

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch `phase/p1-foundation`, lalu **berhenti**. Jangan merge P1 ke `main`.
