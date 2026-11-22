# P3A2 — Geometri yang Benar, Bagian Penting Terlihat, Demo yang Menjelaskan

> Fase: **P3A2** · Lanjutkan di branch `phase/p3a-scene-kit` · Baca `docs/AG-RULES.md` dan **`docs/REVIEW-P3A.md`**.
> Tujuan: QC visual tidak hanya membuktikan angka benar, tapi juga **benda tersambung dengan benar** dan **bagian penting terlihat**. Demo kereta dibuat ulang untuk menjelaskan klaim naskah P2.

## 1. Batasan geometri untuk rakitan
- Setiap rakitan mendeklarasikan **batasan geometri** dan melaporkannya lewat telemetri dalam koordinat dunia, misalnya:
  - `WheelsetOnRail`: titik kontak tapak roda = permukaan atas kepala rel (toleransi kecil); bidang roda sejajar arah rel; jarak antar-roda = lebar sepur (diskalakan); flens di sisi dalam rel.
  - `PistonCrankAssembly`: ujung atas batang = pena piston; ujung bawah batang = pena engkol; piston tetap di dalam silinder.
  - `Suspension`: ujung pegas menempel ke rangka dan ke kotak gandar.
- Tata letak rakitan dihitung oleh fungsi murni yang diuji unit (bukan hanya dicek saat render).
- QC baru **`geometry`**: error kalau batasan dilanggar di frame sampel mana pun.

## 2. Perbaiki `WheelsetOnRail`
- Dua rel sejajar dengan jarak sepur yang benar; gandar tegak lurus rel; kedua roda menapak di kepala rel masing-masing; flens di sisi dalam.
- Opsi **kerucut dilebih-lebihkan** (`taperExaggeration`) supaya kemiringan tapak terlihat; kalau dipakai, wajib tampil label kecil "skala dilebih-lebihkan".
- Dukungan **rel melengkung** (busur) dengan pergeseran lateral wheelset ke arah luar, dan penanda titik kontak serta **lingkaran diameter efektif** roda luar vs roda dalam.

## 3. Bagian penting wajib terlihat
- Entitas fokus mendeklarasikan `visible_parts` (misalnya mesin: `piston`, `crank`, `intake_valve`, `exhaust_valve`, `spark_plug`; kereta: `wheel_left`, `wheel_right`, `contact_left`, `contact_right`, `flange`). Telemetri melaporkan bounding box layar per bagian.
- QC baru **`visibility`**: error kalau bagian yang dideklarasikan tertutup HUD lebih dari 25% atau keluar area aman, pada frame ketika bagian itu relevan (boleh dideklarasikan per rentang waktu).
- `CameraRig` mode `frameEntities` harus **sadar tata letak HUD**: entitas fokus ditempatkan di zona bebas, tidak di zona yang sedang dipakai HUD.

## 4. Anggaran HUD
- Maksimal **2 panel HUD** aktif sekaligus di luar zona judul.
- Utamakan **callout dengan garis penunjuk** yang menempel ke bagian (misalnya "Flens" menunjuk ke flens) daripada panel bertumpuk.
- Tambahkan ke QC `hud-overlap`: error kalau lebih dari 2 panel aktif bersamaan.

## 5. Demo kereta dibuat ulang dari klaim P2
Pakai klaim `verified` dari `projects/p2-kereta/fact-ledger.json` (C1–C3). Setiap teks HUD yang berisi fakta mencatat `claim_ref` di telemetri.
1. **Adegan A (lurus):** wheelset menapak rel lurus; kerucut dilebih-lebihkan dengan `MeasureReveal` "1:20" (C1); callout ke flens.
2. **Adegan B (tikungan):** rel melengkung; wheelset bergeser ke arah rel luar; panah inersia "cenderung lurus" (C2).
3. **Adegan C (diameter efektif):** roda luar menapak di diameter lebih besar, roda dalam di diameter lebih kecil (lingkaran penanda); roda luar menempuh jarak lebih jauh, wheelset berbelok mengikuti tikungan (C3).

Hapus HUD "Jarak Tempuh". Durasi total 15–20 detik.

## 6. Demo mesin diperjelas
- Poros engkol terlihat sepanjang demo (lolos `visibility`).
- Katup diperbesar atau disorot saat membuka; percikan busi terlihat jelas di sekitar 360°.
- Warna ruang bakar membantu membedakan langkah (misalnya campuran masuk, terkompresi, nyala pembakaran, gas buang), diturunkan dari penggerak yang sama.

## 7. Perbaikan kecil P2
Aturan `CLAIM_NAME_NOT_IN_QUOTE`: nama diri dianggap cocok kalau **nama belakangnya** muncul di kutipan (contoh: "Neil Armstrong" ↔ "Armstrong"). Tambahkan test.

## 8. Mutasi baru (harus gagal dengan error yang tepat)
6. Wheelset diangkat 5 cm di atas rel → `geometry`.
7. Gandar sejajar rel (diputar 90°) → `geometry`.
8. Ujung batang penghubung terlepas dari pena engkol → `geometry`.
9. Panel HUD menutupi poros engkol → `visibility`.
10. Tiga panel HUD aktif bersamaan → `hud-overlap`.

Mutasi 1–5 dari P3A tetap harus gagal.

## Bukti (`out/review/p3a/`, timpa yang lama)
- `demo-kereta.mp4`, `demo-mesin.mp4`, contact sheet masing-masing (1 frame per 0,5 detik).
- `stills/`: 3 still resolusi penuh per adegan (awal, tengah, akhir).
- `qc/` (semua layer termasuk `geometry` dan `visibility`), `mutations/` (mutasi 1–10), `perf.md`, `verify.txt` (UTF-8).

## Kriteria lolos
1. `npm run verify` lulus, termasuk test unit tata letak rakitan.
2. Kedua demo lolos semua QC visual, termasuk `geometry` dan `visibility`.
3. Mutasi 1–10 gagal dengan error yang tepat.
4. Demo kereta memvisualkan C1, C2, dan C3 dengan jelas (dinilai pemilik dan Claude dari still).

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch, lalu **berhenti**.
