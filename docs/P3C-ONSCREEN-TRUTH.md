# P3C — Kebenaran Teks di Layar dan Variasi Shot

> Fase: **P3C** · Lanjutkan di branch `phase/p3b-storyboard-coder` · Baca `docs/AG-RULES.md` dan **`docs/REVIEW-P3B.md`**.
> Tujuan: **tidak ada satu pun teks di layar yang tidak bersumber**, dan video tidak lagi berupa satu objek selama 38 detik.

## 1. Teks HUD hanya boleh berasal dari storyboard
- Setiap entri HUD storyboard punya `hud_id` unik. Teks dan nilainya **dikirim ke komposisi sebagai data** (`inputProps`), bukan ditulis di kode adegan.
- Kit menyediakan komponen seperti `<Hud id="..." />` yang mengambil teks dari data storyboard. Kode adegan hanya mengatur posisi, waktu, dan animasi.
- Validator statis (S9) menolak kode adegan yang memuat komponen HUD tanpa `hud_id` yang valid atau string teks HUD langsung di kode.
- **QC L5 (runtime, dari telemetri):** setiap elemen HUD yang tampil harus punya `hud_id` yang ada di storyboard, dan teksnya harus sama dengan teks storyboard (atau nilai penggerak yang diformat untuk HUD `bind_to_driver`). Elemen tambahan → error `L5_UNSANCTIONED_HUD`. Angka di teks yang tidak cocok dengan `value`/`unit` klaimnya → error `L5_FACT_MISMATCH`.

## 2. Gerbang dan ekstraksi QC storyboard
- Ekstraksi teks QC hanya dari field tampilan (`title`, `subtitle`, `label`, `detail`, `valueText`, item daftar), bukan dari semua props.
- HUD `bind_to_driver` dikecualikan dari pemeriksaan angka-klaim, tapi wajib merujuk driver yang dideklarasikan di adegan itu.
- **Error storyboard menghentikan pipeline** setelah 1 kali penulisan ulang; Scene Coder tidak boleh jalan dengan storyboard yang masih error.

## 3. Satuan dan teks yang terikat fase
- Satu formatter nilai+satuan di kit: `deg` → `°` tanpa spasi, `mm`, `km/jam`, dan seterusnya, dengan format angka `id-ID`. Kode adegan tidak boleh menulis satuan sendiri.
- `hud-format` menandai satuan yang tidak dinormalisasi (misalnya "deg").
- HUD storyboard boleh punya `when: { driver_between: [a, b] }`. Kit hanya menampilkannya di rentang itu, dan QC `mechanics` memeriksa teks tidak tampil di luar rentang. Untuk mesin, penjelasan per langkah wajib memakai ini.

## 4. Variasi shot
- Storyboard merencanakan `shot_type` per adegan dari daftar: `establishing`, `closeup`, `cutaway`, `cross_section`, `diagram_overlay`, `comparison`, `summary`, beserta `camera_move`.
- **QC variasi (kode):** minimal 3 jenis shot berbeda per video; dua adegan berurutan tidak boleh punya `shot_type` dan `focus_entities` yang sama; adegan pertama sebaiknya `establishing` dengan objek konteks.
- Kit menambah/memakai ulang komponen pendukung:
  - `TrainCar` dari spike (diperbaiki agar konsisten dengan `WheelsetOnRail`) untuk shot kereta dari luar;
  - `RailCrossSection`: penampang roda di atas rel yang memperlihatkan kerucut tapak dan flens;
  - `EngineBlock` untuk shot mesin dari luar, dengan transisi ke cutaway;
  - `DiagramOverlay`: garis, panah, dan label 2D di atas adegan 3D (misalnya busur tikungan dan panah inersia).
- Semua komponen baru wajib punya batasan geometri, `visible_parts`, dan test, seperti rakitan P3A2.

## 5. Mutasi (semua dengan render dan telemetri sungguhan)
1. Kode adegan menampilkan HUD tambahan yang tidak ada di storyboard → `L5_UNSANCTIONED_HUD`.
2. Teks HUD dengan satuan salah ("1.435 m" padahal klaim "mm") → `L5_FACT_MISMATCH`.
3. Teks langkah "usaha" tampil saat langkah buang → `mechanics`.
4. Satuan "deg" → `hud-format`.
5. Storyboard dengan tiga adegan berurutan berjenis shot dan fokus sama → QC variasi.
6. **Ulangi mutasi `sync`** dari P3B dengan render sungguhan dan simpan telemetrinya.

## 6. Uji ulang
Jalankan ulang `p2-kereta` dan `p2-mesin4tak` dari S6 (storyboard) sampai pratinjau; pakai ulang suara dan timeline yang ada.

## Bukti (`out/review/p3b/`, timpa yang lama)
- Per topik: `storyboard.json` (dengan `shot_type`), `qc/` (storyboard, visual per adegan termasuk L5), `scenes/`, `preview.mp4`, contact sheet, 1 still per adegan, dan **`onscreen-text.md`** (daftar semua teks yang tampil di video beserta `hud_id`, klaim, dan kutipan sumbernya).
- `mutations/` (mutasi 1–6, masing-masing dengan telemetri), `stats.md`, `verify.txt` (UTF-8).

## Kriteria lolos
1. `npm run verify` lulus.
2. Kedua video: **0 teks HUD tanpa `hud_id` storyboard**, semua angka di layar cocok dengan klaim atau penggerak, dan `onscreen-text.md` lengkap.
3. QC variasi lolos (minimal 3 jenis shot per video) dan semua QC visual lolos.
4. Mutasi 1–6 gagal dengan error yang tepat, dibuktikan dengan telemetri.

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch, lalu **berhenti**.
