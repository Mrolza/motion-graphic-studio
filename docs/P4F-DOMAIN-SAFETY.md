# P4F — Visual Sesuai Topik, Cek Panah & Cakupan yang Jujur, Render Deterministik

> Fase: **P4F** · Branch: `phase/p4f-domain-safety` · Baca `docs/AG-RULES.md` dan **`docs/REVIEW-P4E.md`**.
> Tujuan: komponen visual tidak pernah dipakai di luar topiknya, cek panah dan cakupan benar-benar memeriksa yang terlihat dan dijelaskan, dan render deterministik. Hasilnya video mesin yang layak tayang.
> Urutan: **0 → A → B → C → D**. Bagian A–C dikerjakan dengan klien tiruan. Gemini sungguhan hanya di bagian D, maksimal 20 per run dan **≤ 40 untuk fase ini**.

## 0. Merge
1. `npm run verify` lulus.
2. Merge `phase/p4e-truth-calibration` ke `main` (`--no-ff`), tag `p4e-done`, push.
3. Buat branch `phase/p4f-domain-safety`.

## A. Domain kit (tanpa Gemini)

**A1. Registri domain**
- Setiap rakitan dan overlay kit punya `domain` (`rail`, `engine`, atau `generic`) dan daftar `entities`. Keduanya ditulis otomatis ke `KIT-API.md`.
- Pecah `DiagramOverlay`:
  - `curveArc` dan `inertiaArrow` pindah ke `RailCurveOverlay` (domain `rail`);
  - `DiagramOverlay` generik hanya berisi elemen netral.

**A2. Domain topik**
- Konsep S1 menentukan `domain`.
- Prompt storyboard **hanya menampilkan** komponen, entitas, dan shot yang tersedia di domain itu ditambah `generic`.
- Error baru:
  - QC storyboard: `SB_ENTITY_OFF_TOPIC`;
  - `scene-safety`: `SCENE_COMPONENT_OFF_TOPIC` (impor komponen dari domain lain).

**A3. Shot per domain**
- `cross_section` hanya tersedia jika domain punya komponen bertampilan `section`.
- Tambahkan **`CylinderSection`** (domain `engine`):
  - irisan dinding silinder, piston, batang piston, katup masuk dan buang, ruang bakar;
  - status katup diturunkan dari sudut engkol: masuk terbuka 0–180°, keduanya tertutup 180–540°, buang terbuka 540–720°;
  - volume ruang bakar mengecil saat kompresi.
- Test telemetri: status katup dan posisi piston di 8 sudut sampel cocok dengan hitungan.

**A4. Aturan variasi shot**
Minimal 3 jenis shot hanya dihitung dari shot yang **tersedia** di domain. Jangan memaksakan shot yang tidak relevan.

## B. Cek visual yang jujur (tanpa Gemini)

**B1. Panah per frame**
- Semua elemen berbentuk panah yang dirender (`MotionArrow`, panah overlay, `Arrow3D`) didaftarkan ke telemetri.
- Untuk setiap panah yang terikat gerak: tanda arah panah = tanda kecepatan bagian yang dirujuk di ≥ 95% frame dengan |v| di atas ambang.
- Panah yang tidak terikat gerak tidak boleh tampil bersama bagian yang bergerak bolak-balik. Jika tetap tampil → error `VIS_ARROW_UNBOUND`.
- **Test regresi:** S2 mesin P4E harus FAIL.

**B2. Cakupan dengan kalimat khusus**
- Setiap `key_step` membutuhkan kalimat **khusus**, yaitu kalimat yang klaimnya ditandai `step_id` langkah itu. Penandaan dilakukan di riset/ideate.
- Kalimat daftar yang menyebut ≥ 3 langkah tidak dihitung.
- `coverage.md` menampilkan kalimat khusus per langkah.
- **Test regresi:** tabel `coverage.md` kereta P4E harus FAIL. Langkah "self-centering" dan "geser ke rel luar" belum punya kalimat khusus, jadi perbaiki di naskah atau keluarkan dari `key_steps` secara eksplisit.

**B3. Teks HUD tidak boleh terpotong**
- Teks yang dirender (dari telemetri DOM) wajib sama persis dengan teks storyboard.
- Ellipsis atau potongan → error `HUD_TRUNCATED`.
- Callout > 8 kata → error (sebelumnya hanya peringatan).

## C. Determinisme dan kebersihan (tanpa Gemini)
- **C1.** `scene-safety` melarang `Math.random`, `Date.now`, `new Date(`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `useFrame`, dan `clock`. Jika dipakai → `FORBIDDEN_API`.
- **C2.** Satu video memakai satu mesin TTS dan satu suara.
  - Jika satu adegan jatuh ke fallback, buat ulang semua adegan dengan mesin yang sama.
  - Jika tidak bisa → `AUDIO_VOICE_MISMATCH` (FAIL).
  - Mesin dan suara per adegan dicatat di `final-qc.json`.
- **C3.** Peringatan `THREE.Clock` disaring di handler log browser Remotion. Peringatan lain tetap tampil.
- **C4.** Typecheck adegan memanggil `tsc` lewat `process.execPath`, tanpa `shell: true`.

## D. Uji ulang (dengan Gemini)
- **Mesin** dijalankan dari S1 (domain `engine`) sampai S12, profil Hemat. Adegan langkah hisap/kompresi memakai `CylinderSection`.
- **Kereta** **tidak dibuat ulang**. Jalankan QC final dengan aturan baru pada `out/review/p4e/p2-kereta/final.mp4` dan laporkan hasilnya.
  - Jika ada yang gagal, misalnya cakupan B2, perbaiki seminimal mungkin dan jelaskan di laporan.
  - Video kereta yang lolos di P4E jangan diganti tanpa alasan.

## Mutasi
32. Storyboard mesin dengan `rail_cross_section` → `SB_ENTITY_OFF_TOPIC`
33. Adegan mesin mengimpor `RailCurveOverlay` → `SCENE_COMPONENT_OFF_TOPIC`
34. S2 mesin P4E (panah tetap ke atas) → `VIS_ARROW_UNBOUND` atau `VIS_ARROW_DIRECTION_MISMATCH`
35. Cakupan kereta P4E → FAIL (tanpa kalimat khusus)
36. Callout terpotong "…" → `HUD_TRUNCATED`
37. Adegan memakai `Math.random()` / `useFrame` → `FORBIDDEN_API`
38. Satu adegan fallback ke Google TTS → `AUDIO_VOICE_MISMATCH`
39. `CylinderSection` di 450° dengan katup buang terbuka → error telemetri

Mutasi 1–31 dijalankan ulang.

## Bukti (`out/review/p4f/`)
- **Mesin:**
  - `final.mp4`, `final-qc.md`, `coverage.md` (kalimat khusus per langkah), `arrows.md` (per frame, semua panah);
  - `onscreen-text.md`, `captions.srt`, `publish.md`, still per adegan;
  - `cylinder-section/` (8 still + tabel telemetri katup/piston).
- **Kereta:** `requalify.md` (hasil QC final aturan baru pada video P4E).
- **Lainnya:** `mutations/` (1–39), `stats.md` (per fase), `verify.txt`.

## Kriteria lolos
1. `npm run verify` lulus.
2. `final.mp4` mesin berstatus **PASS**.
3. Tidak ada entitas atau komponen di luar domain mesin. Hisap/kompresi memakai `CylinderSection` dengan status katup yang benar.
4. `arrows.md`: semua panah cocok per frame. `coverage.md`: empat kalimat khusus. Tidak ada HUD terpotong.
5. Satu mesin/suara TTS per video. Larangan API deterministik aktif.
6. Mutasi 1–39 gagal dengan error yang tepat.
7. Gemini ≤ 20 per run dan ≤ 40 untuk fase ini, dilaporkan per fase.

Catat status di `docs/PROGRESS.md` (dengan panggilan per fase), commit, push branch, lalu **berhenti**.
