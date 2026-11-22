# P3A — Scene Kit Blueprint + QC Visual Otomatis

> Fase: **P3A** · Branch: `phase/p3a-scene-kit` · Baca `docs/AG-RULES.md`, `docs/PRD.md` (bagian 3, 7, 8, 13), **`docs/REVIEW-P0.md`**, **`docs/REVIEW-P0B.md`**, `docs/REVIEW-P2C.md`.
> Tujuan: mengubah prototipe kit dari spike menjadi **Scene Kit yang andal**, lengkap dengan QC visual otomatis yang membuktikan gerak, framing, dan HUD benar **di hasil render**. Belum ada Gemini Scene Coder dan belum ada audio di fase ini (itu P3B dan P4).

## 0. Tindak lanjut P2, lalu merge
1. Di `phase/p2-facts-script`, kerjakan 4 tindak lanjut di `docs/REVIEW-P2C.md`, tambahkan test-nya, lalu jalankan ulang S4 (QC + maksimal 1 penulisan ulang) untuk naskah sejarah. Catat hasilnya di `out/review/p2/followup.md`.
2. `npm run verify` lulus → merge ke `main` (`--no-ff`), tag `p2-done`, push.
3. Buat branch `phase/p3a-scene-kit` dari `main`, tag `p3a-start`.

## 1. Struktur kit (`remotion/src/kit/`)
| Folder | Isi |
|---|---|
| `primitives/` | `Box`, `Cylinder`, `Sphere`, `Torus`, `Cone`, `Group`, `Grid`, `Ground`, `Line3D`, `Arrow3D`, `Label3D`, dukungan `cutaway`/transparansi |
| `tokens/` | Palet `blueprint-navy`, `industrial-orange`, `dark-mystery` (warna, font OFL, ketebalan garis, glow). Tidak ada warna bebas di adegan |
| `drivers/` | Lihat bagian 2 |
| `camera/` | `CameraRig` dengan preset 9:16 (`portrait-lower`, `portrait-center`, `portrait-closeup`) dan mode **`frameEntities`** (kamera otomatis membingkai entitas fokus) |
| `assemblies/` | Rakitan yang sudah ditinjau, digerakkan driver: `WheelsetOnRail` (roda menapak kepala rel, sudut putar dari jarak tempuh), `PistonCrankAssembly` (piston, batang, engkol, katup hisap/buang, busi), `Suspension` (pegas tersambung ke rangka) |
| `foreground/` | Elemen latar depan dan parallax (tiang, garis kedalaman, partikel) untuk kesan ruang |
| `hud/` | Lihat bagian 4 |
| `telemetry/` | Lihat bagian 3 |
| `transitions/` | Transisi antaradegan sesuai token gaya |

Primitif umum tetap tersedia. Rakitan adalah tambahan untuk objek yang sudah terbukti benar, bukan pengganti.

## 2. Satu penggerak (single driver)
- `useDriver({ name, from, to, unit, startSec, durationSec, curve })` mengembalikan nilai penggerak per frame.
- Helper turunan yang murni (pure function) dan diuji unit: engkol-batang (`solveCrankSlider`, sudah ada), rasio roda gigi, rotasi roda dari jarak tempuh (`angle = jarak / jari-jari`), osilasi pegas, status katup dari sudut engkol.
- **Semua bagian yang terhubung secara fisik dan semua angka HUD terkait diturunkan dari penggerak yang sama.** Rakitan menerima nilai penggerak sebagai props, bukan waktu.

## 3. Telemetri (bukti perilaku di hasil render)
- Mode telemetri lewat `inputProps.telemetry = true`. Setiap rakitan, entitas fokus, dan komponen HUD melaporkan status per frame: nilai penggerak, status bagian (misalnya katup `open/closed`), **bounding box di layar** (proyeksi dari dunia 3D lewat kamera), dan teks HUD yang ditampilkan.
- Data dikirim lewat log browser dengan prefiks tetap (misalnya `MGS_TELEMETRY {...}`) dan ditangkap di Node lewat callback log browser dari renderer Remotion. Verifikasi nama opsi API-nya lewat skill `remotion-render`/`remotion-best-practices`; kalau cara ini tidak tersedia, pilih mekanisme lain yang setara dan catat di `DECISIONS.md`.
- Mode normal (telemetri mati) tidak boleh terpengaruh performanya.

## 4. HUD
- `StatCounter`: hanya untuk besaran yang **memang berubah**; bisa diikat ke penggerak (`bindToDriver`), tanpa easing sendiri kalau terikat.
- `MeasureReveal` (baru): untuk besaran tetap (dimensi, standar). Garis ukur memanjang lalu angka muncul, tanpa count-up.
- `DimensionLine`, `Callout` (menempel ke posisi layar sebuah entitas), `Waveform`, `ListReveal`, `CompareCard`, `DateStamp`, `Timeline`, `KineticTitle`.
- **Tata letak berbasis zona**: zona judul (atas), zona bebas (tengah), zona callout (sepertiga bawah), zona caption (bawah, dicadangkan untuk P4). Komponen dalam zona yang sama otomatis ditumpuk tanpa tumpang-tindih.
- Semua angka lewat satu formatter `id-ID`. Ukuran minimum teks dari REVIEW-P0 tetap berlaku.

## 5. QC visual (`src/core/qc/visual/`) dan CLI
Semua pemeriksaan bekerja dari **telemetri hasil render** (sampel setiap 0,25 detik) dan dari frame gambar:
| Pemeriksaan | Error jika |
|---|---|
| `mechanics` | Invarian yang dideklarasikan dilanggar (kontrak `invariants` di Storyboard, P1), misalnya katup hisap terbuka di luar 0°–180°, atau angka HUD ≠ nilai penggerak |
| `framing` | Bounding box entitas fokus keluar dari area aman 9:16 pada frame sampel |
| `hud-overlap` | Dua elemen HUD bertumpuk, atau HUD menutupi entitas fokus lebih dari batas yang ditetapkan |
| `hud-format` | Angka di HUD tidak berformat `id-ID` |
| `blank` | Frame kosong/hitam (pakai detektor dari spike) |

CLI: `mgs qc-visual --composition <id>` menjalankan render telemetri, semua pemeriksaan, dan menyimpan `QcReport`.

## 6. Komposisi demo (ditulis tangan, bukan Gemini)
1. **Kereta (12–15 detik):** wheelset menapak rel dan bergulir (rotasi dari jarak tempuh), penjelasan roda kerucut dengan `MeasureReveal` "1:20", callout yang menempel ke roda, foreground tiang lewat, kamera membingkai roda.
2. **Mesin 4 tak (16–20 detik):** satu penggerak sudut engkol 0°–720°; empat langkah dengan label yang muncul tepat di rentang sudutnya; katup dan percikan busi diturunkan dari sudut; HUD "Sudut engkol" terikat ke penggerak; deklarasi invarian yang lengkap untuk QC.

Keduanya harus lolos semua QC visual di bagian 5.

## 7. Uji mutasi QC visual (wajib, perilaku)
Buat varian rusak dari demo dan buktikan setiap varian **gagal** dengan error yang tepat:
1. Katup hisap digerakkan oleh waktu, bukan sudut engkol → `mechanics`.
2. HUD sudut engkol punya easing sendiri → `mechanics`.
3. Kamera memotong poros engkol keluar layar → `framing`.
4. Callout ditempatkan menimpa `StatCounter` → `hud-overlap`.
5. Angka HUD diformat `1,435` → `hud-format`.

## 8. Dokumentasi API kit untuk Gemini
Hasilkan `remotion/src/kit/KIT-API.md` secara otomatis dari tipe TypeScript/JSDoc (bukan ditulis manual), berisi semua komponen, props, rakitan, driver, dan contoh singkat. Dokumen ini akan menjadi masukan Gemini Scene Coder di P3B.

## Bukti (`out/review/p3a/`)
- `demo-kereta.mp4`, `demo-mesin.mp4` (720×1280, 30 fps), masing-masing dengan `contact-sheet.png` (1 frame per 0,5 detik).
- `qc/`: laporan QC visual kedua demo.
- `mutations/`: laporan untuk kelima varian rusak.
- `perf.md`: waktu render normal dan mode telemetri untuk kedua demo pada profil Standar.
- `KIT-API.md` (salinan), `verify.txt` (UTF-8), `followup.md` dari langkah 0.

## Kriteria lolos
1. Tindak lanjut P2 selesai, P2 di-merge (`p2-done`).
2. `npm run verify` lulus, termasuk test unit untuk helper driver.
3. Kedua demo lolos semua QC visual.
4. Kelima mutasi gagal dengan error yang tepat.
5. Tidak ada file kit > 400 baris.

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch `phase/p3a-scene-kit`, lalu **berhenti**.
