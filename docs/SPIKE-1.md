# SPIKE-1 — Bukti Gaya Blueprint 3D + Scene Kit + Gemini Scene Coder

> Fase: **P0** · Branch: `phase/p0-spike` · Baca dulu `docs/AG-RULES.md` dan `docs/PRD.md` (bagian 3, 5, 7, 8).
> Tujuan: membuktikan, **sebelum** membangun aplikasi, bahwa (1) low-poly 3D bisa dirender di laptop pemilik dengan dan tanpa GPU, dan (2) Gemini bisa menulis kode adegan yang benar memakai Scene Kit kecil.
> Ini spike: kode boleh sederhana, tapi pengukuran dan buktinya harus jujur. **Tidak ada UI web di fase ini.**

## Topik uji
"Kenapa kereta tidak tergelincir?" (topik yang sama dengan video referensi, supaya bisa dibandingkan langsung). Durasi target 20–30 detik, 3–4 adegan, tanpa TTS (narasi cukup ditulis sebagai teks HUD/caption statis).

## Langkah

### 1. Persiapan repo
- `git init`, branch `main` berisi commit awal (`.gitignore`, `docs/`), lalu buat branch `phase/p0-spike` dan tag `p0-start`.
- Pasang remote `origin` ke repo GitHub pribadi pemilik `Mrolza/motion-graphic-studio` (sudah dibuat pemilik, private) lalu push `main` dan branch spike.
- Proyek Remotion minimal di `spike/` dengan `@remotion/three`, `three`, `@react-three/fiber`. Pakai versi Remotion stabil terbaru; kalau bermasalah di Windows, pakai 4.0.536 (terbukti jalan di laptop ini). Catat versi yang dipakai.

### 2. Scene Kit mini (`spike/src/kit/`)
Bangun dan uji komponen berikut, dengan token gaya Blueprint (latar biru gelap, aksen kuning dan cyan, seperti referensi):
- 3D: `Rail`, `Wheel` (dengan flens), `Axle`, `TrainCar` (low-poly sederhana), `Pole`, `Ground`, `Spring`.
- Kamera: `CameraRig` dengan mode `dolly`, `orbit`, `closeUp`, termasuk easing.
- Gerak: `spin`, `translatePath`, `oscillate`, `highlight`.
- HUD (2D di atas 3D): `TitleCard`, `StatCounter` (angka naik, misalnya 1.249 → 1.435 mm), `DimensionLine`, `Callout`.
- Semua komponen menerima waktu dalam detik (`startSec`, `durationSec`).

### 3. Uji render dan profil perangkat
Render komposisi contoh buatan tangan (1 adegan, 6 detik, 720×1280, 30 fps) dengan:
- `gl: "angle"` (GPU Intel Arc),
- `gl: "swangle"` (software, simulasi laptop tanpa GPU),
- concurrency 1, 2, 4.

Catat `render_ms`, RAM bebas minimum, dan apakah hasilnya identik secara visual. Cek juga apakah opsi akselerasi encoding hardware Remotion berlaku di Windows; kalau tidak, catat.

### 4. Gemini Scene Coder
- Tulis prompt (`spike/prompts/scene-coder.md`) yang memberi Gemini: daftar API Scene Kit (nama komponen + props + contoh), token gaya, aturan whitelist (PRD bagian 7), dan **satu spesifikasi adegan** dalam JSON (entitas, kamera, gerak, HUD, durasi).
- Buat 3–4 spesifikasi adegan untuk topik uji, misalnya: (1) kereta melaju + judul, (2) close-up roda dan flens, (3) lebar rel 1.435 mm dengan garis ukur, (4) pegas suspensi berosilasi.
- Pipeline mini: spesifikasi → Gemini menulis `.tsx` → **validator** (whitelist import, larangan `fetch`/`eval`/`Math.random`/`Date.now`/`window`, typecheck) → render still di detik tengah → deteksi frame kosong/hitam → kalau gagal, kirim error ke Gemini untuk perbaikan (maks 2 kali).
- Pakai model Gemini dari env (`GEMINI_MODEL`); jangan membaca `.env.local`, cukup gunakan variabelnya lewat proses.
- Catat jumlah panggilan, berapa adegan lolos tanpa perbaikan, berapa yang butuh perbaikan, dan berapa yang gagal total.

### 5. Gabungkan
Render keempat adegan menjadi satu video (720×1280, 30 fps) dengan transisi sederhana. Tidak perlu audio.

## Bukti yang wajib ada (`out/review/p0/`)
- `spike.mp4`: video gabungan.
- `stills/`: 3 still per adegan (awal, tengah, akhir).
- `scenes/`: file `.tsx` hasil Gemini apa adanya, plus versi final setelah perbaikan bila ada.
- `metrics.md`: tabel render (`angle` vs `swangle`, concurrency, waktu, RAM), statistik Gemini Scene Coder, versi paket, dan catatan masalah.

## Kriteria lolos
1. Low-poly 3D berhasil dirender dengan `angle` **dan** `swangle` (yang kedua boleh lambat; catat seberapa lambat).
2. Minimal 3 dari 4 adegan ditulis Gemini dan lolos validator, dengan maksimal 2 kali perbaikan per adegan.
3. Tidak ada frame kosong/hitam di `spike.mp4`.
4. Visual menunjukkan gerak objek nyata (roda berputar, pegas berosilasi, angka HUD naik), bukan hanya gerak kamera.

Tulis hasil di `docs/PROGRESS.md` dengan status DONE atau PARTIAL sesuai `AG-RULES.md` bagian 5. Commit, push branch `phase/p0-spike`, lalu **berhenti**. Jangan gabungkan ke `main`.
