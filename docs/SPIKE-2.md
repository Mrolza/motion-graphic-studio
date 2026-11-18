# SPIKE-2 — Uji Generalisasi: Topik Baru Tanpa Komponen Khusus

> Fase: **P0b** · Branch: `phase/p0b-generalize` (dibuat dari `phase/p0-spike`) · Baca `docs/AG-RULES.md` dan `docs/REVIEW-P0.md`.
> Pertanyaan yang dijawab: **apakah Gemini bisa membangun objek baru dari primitif umum**, atau Scene Kit harus punya komponen khusus untuk setiap topik? Jawaban ini menentukan desain Scene Kit di P3.

## Topik uji
"Bagaimana mesin 4 tak bekerja?" (motor bakar empat langkah: hisap, kompresi, usaha, buang). Durasi 20–30 detik, 4 adegan.

## Aturan utama
- **Dilarang membuat komponen khusus mesin** (tidak boleh ada `Piston`, `Crankshaft`, `EngineBlock` di Scene Kit).
- Scene Kit hanya boleh berisi **primitif umum**: `Box`, `Cylinder`, `Sphere`, `Torus`, `Cone`, `Group` (posisi/rotasi/skala), `Ground`, `Grid`, plus `CameraRig`, preset gerak, dan HUD yang sudah ada.
- Tambahkan dua kemampuan umum yang dibutuhkan mesin apa pun:
  - **`linkage`**: helper matematis untuk mekanisme engkol-batang (posisi piston dihitung dari sudut engkol, bukan diperkirakan).
  - **`clip` / `cutaway`**: membuat badan objek transparan atau terpotong supaya bagian dalam terlihat.
- Gemini harus **menyusun sendiri** piston, batang penghubung, poros engkol, katup, dan silinder dari primitif tersebut.

## Perbaikan dari REVIEW-P0 yang ikut dikerjakan
1. Format angka `id-ID` di semua HUD.
2. Ukuran teks minimum (judul ≥ 44 px, caption ≥ 32 px, callout ≥ 26 px di lebar 720).
3. Preset framing kamera 9:16.
4. Commit folder `.agents/`.

## Langkah
1. Siapkan Scene Kit primitif (boleh mengubah kit spike; komponen khusus kereta boleh tetap ada tapi **tidak boleh dipakai** di spike ini).
2. Tulis 4 spesifikasi adegan: (1) penampang mesin + judul, (2) langkah hisap dan kompresi, (3) langkah usaha (percikan busi) dan buang, (4) ringkasan 4 langkah dengan diagram siklus.
3. Pipeline sama seperti SPIKE-1: Gemini → validator → still → perbaikan maks 2 kali.
4. Render gabungan 720×1280, 30 fps, tanpa audio.

## Bukti (`out/review/p0b/`)
- `spike2.mp4`, `stills/` (3 per adegan), `scenes/` (raw dan final), `metrics.md`.
- `mechanics-check.md`: bukti bahwa gerak piston mengikuti sudut engkol (misalnya tabel sudut engkol vs posisi piston di beberapa frame), dan urutan katup sesuai langkah.

## Kriteria lolos
1. Minimal 3 dari 4 adegan lolos validator (maks 2 perbaikan per adegan).
2. Objek mesin **bisa dikenali** dari still (dinilai pemilik dan Claude saat review).
3. Gerak mekanis benar: piston naik-turun sinkron dengan putaran engkol; katup hisap terbuka saat langkah hisap, katup buang terbuka saat langkah buang.
4. Tidak ada frame kosong; angka HUD berformat `id-ID`.

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch, lalu **berhenti**.
