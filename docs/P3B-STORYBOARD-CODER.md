# P3B — Suara, Storyboard, dan Gemini Scene Coder (video pertama dari naskah)

> Fase: **P3B** · Branch: `phase/p3b-storyboard-coder` · Baca `docs/AG-RULES.md`, `docs/PRD.md` (bagian 5–7), `docs/REVIEW-P0B.md`, **`docs/REVIEW-P3A2.md`**.
> Tujuan: dari naskah yang sudah lolos Gerbang 1 (P2), hasilkan **video pertama** secara otomatis: suara + timing kata → storyboard → Gemini menulis adegan memakai Scene Kit → QC visual → render. Audio mix profesional (BGM, SFX, −14 LUFS) menyusul di P4; di sini cukup VO mentah untuk menilai sinkronisasi. Gaya: **Blueprint** saja.

## 0. Perbaikan P3A2, lalu merge
1. Di `phase/p3a-scene-kit`, kerjakan 6 perbaikan di `docs/REVIEW-P3A2.md` (kit, QC, test, dan render ulang demo kereta/mesin sebagai bukti di `out/review/p3a/fix/`).
2. `npm run verify` lulus → merge ke `main` (`--no-ff`), tag `p3a-done`, push.
3. Branch `phase/p3b-storyboard-coder` dari `main`, tag `p3b-start`.

## 1. S5 Suara & Timeline — `src/core/stages/voice.ts`
- Dari `script.json` yang sudah APPROVED, buat VO per kalimat dengan modul `tts.ts` (suara id-ID yang sudah dipakai di content-studio), ambil timing kata, lalu bangun `timeline.json` dengan modul `timeline.ts`: kalimat, kata beserta waktu mulai/selesai, dan durasi per adegan.
- Angka di naskah harus dibaca benar oleh TTS (misalnya "1:20" dibaca "satu banding dua puluh"). Kalau perlu, tambahkan teks ucapan terpisah (`spoken_text`) di kontrak Script tanpa mengubah teks tampilan, dan catat di `DECISIONS.md`.
- CLI: `mgs voice <id>`. Tidak memakai Gemini.

## 2. S6 Storyboard — `src/core/stages/storyboard.ts`
- Satu panggilan Gemini. Masukan: naskah (dengan `claim_refs`), timeline, klaim `verified` dari ledger, gaya/palet, dan ringkasan `KIT-API.md` (daftar rakitan, primitif, driver, komponen HUD).
- Keluaran: `storyboard.json` sesuai kontrak P1, satu adegan storyboard per adegan naskah, dengan `lane: code_3d`, `focus_entities`, `visible_parts`, `driver` dan `invariants` (bila ada mekanisme), `hud[]` (setiap angka/fakta punya `claim_ref`, atau `bind_to_driver`, atau `illustrative: true`), dan `trigger_words` (kata dari narasi adegan itu yang memicu gerak utama).

## 3. S7 QC Storyboard — `src/core/qc/storyboard.ts`
**Kode:**
- Durasi adegan cocok dengan timeline; `trigger_words` benar-benar ada di kalimat adegan itu.
- Setiap teks HUD berisi angka/fakta punya `claim_ref` ke klaim `verified`, dan angkanya cocok dengan `value` klaim (format `id-ID`).
- Maksimal 2 panel HUD per adegan; `focus_entities` dan `visible_parts` tidak kosong; `invariants` merujuk driver yang dideklarasikan.

**LLM (1 panggilan):** apakah rencana visual setiap adegan konsisten dengan klaim yang dirujuk (misalnya flens digambar di sisi dalam, piston turun saat langkah hisap), dan apakah visualnya benar-benar menjelaskan kalimat narasi, bukan sekadar dekorasi.

Error → storyboard ditulis ulang maksimal 1 kali.

## 4. S8 Scene Coder & S9 Validasi — `src/core/stages/scene-coder.ts`
- Per adegan, Gemini menulis satu file `.tsx` memakai Scene Kit saja, berdasarkan spesifikasi adegan storyboard dan waktu pemicu (detik mulai dihitung dari timeline).
- Kit menyediakan pembungkus wajib (misalnya `<FocusEntity id parts>` dan pendaftaran HUD) supaya telemetri selalu ada; adegan tanpa telemetri ditolak.
- Validasi berurutan: whitelist import dan larangan API (PRD bagian 7) → `tsc` → still → **render telemetri + seluruh QC visual P3A** dengan invarian dari storyboard → kalau gagal, error dikirim kembali ke Gemini (maksimal 2 perbaikan per adegan).
- QC baru **`sync`**: gerak utama adegan (perubahan driver atau kemunculan entitas yang dipicu) mulai dalam ±0,3 detik dari waktu `trigger_words` diucapkan.
- Batas 300 baris per file adegan.

## 5. Perakitan dan pratinjau
- Gabungkan semua adegan menjadi satu komposisi per proyek (transisi dari token gaya), render 720×1280 30 fps dengan profil perangkat.
- **Pratinjau VO:** mux video dengan VO mentah (tanpa BGM/SFX/normalisasi) supaya sinkronisasi bisa dinilai. Mix lengkap di P4.
- CLI: `mgs storyboard <id>`, `mgs scenes <id>`, `mgs render <id> --preview`, dan `mgs run <id> --from voice --until preview`.

## 6. Uji end-to-end
Jalankan dari naskah APPROVED P2:
1. `p2-kereta` (Kenapa kereta tidak tergelincir?)
2. `p2-mesin4tak` (Bagaimana mesin 4 tak bekerja?)

Naskah sejarah tidak diuji di fase ini (gaya Peta & Arsip ada di P6).

## 7. Mutasi QC storyboard (harus error)
1. HUD menampilkan angka yang tidak ada di ledger.
2. `trigger_words` berisi kata yang tidak ada di narasi adegan.
3. Tiga panel HUD dalam satu adegan.
4. `claim_ref` ke klaim `unverified`.
5. Adegan dengan gerak utama mulai 1,5 detik setelah kata pemicu → `sync`.

## Bukti (`out/review/p3b/`)
- Per topik: `timeline.json`, `storyboard.json`, `qc/` (storyboard + QC visual per adegan), `scenes/` (raw dan final per adegan beserta jumlah perbaikan), **`preview.mp4` (video + VO mentah)**, contact sheet, dan 1 still resolusi penuh per adegan.
- `stats.md`: panggilan LLM per tahap (`llm_calls_last_run`), jumlah perbaikan per adegan, adegan yang gagal (kalau ada), waktu render, durasi video vs durasi VO.
- `mutations/`, `verify.txt` (UTF-8), dan `out/review/p3a/fix/` dari langkah 0.

## Kriteria lolos
1. Perbaikan P3A2 selesai dan P3A di-merge (`p3a-done`).
2. `npm run verify` lulus.
3. Kedua topik menghasilkan `preview.mp4` dengan semua adegan lolos QC visual dan `sync` (maksimal 2 perbaikan per adegan).
4. QC storyboard 0 error; setiap fakta di layar bisa dilacak ke klaim `verified`.
5. Mutasi 1–5 tertangkap.
6. Panggilan LLM dari S6 sampai S9 ≤ 14 per video.

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch, lalu **berhenti**.
