# Review P4 Akurasi Teks, Audio, & Video Final — oleh Claude (advisor)

> Tanggal: 20 November 2026 · Branch: `phase/p4-audio-final` · Status AG: **PARTIAL** · Status review: **PARTIAL diterima, belum merge**

## Yang tercapai
- **Langkah 0 beres:** P3B sudah di-merge ke `main` dengan tag `p3b-done`; branch P4 dibuat.
- **Teks di layar kini setia pada sumber.** Verifier semantik bekerja pada storyboard asli, misalnya:
  - "peluang **lebih kecil** flens bergesekan";
  - "**Tanpa bentuk kerucut**, inersia membuat roda **cenderung** melaju lurus".
- **HUD driver kualitatif.** "Diameter Efektif" dan "Geser Lateral" tampil sebagai batang tanpa angka karangan. Adegan diagram punya badge "Skala dilebihkan (4,5×)".
- **Kereta di shot pembuka sudah besar**, karena aturan isi ≥ 30% berjalan.
- **Jeda VO dirapatkan** pada audio asli tanpa TTS ulang: jeda maksimum turun dari 0,85 detik menjadi 0,30 detik.
- **AG berhenti dengan benar** saat kuota harian habis (sesuai AG-RULES §6). `npm run verify` lulus (72 test).

## Masalah 1 (kritis): kuota harian Gemini habis karena pipeline berulang tanpa henti
Penghitung run terakhir kereta mencatat S6 = 7, S7 = 40, S8 = 49, dan S9 = 61, total **157 panggilan untuk satu video**. Jatah PRD ≤ 15.

Rantai penyebabnya dari kode dan hasil QC:
1. Adegan S2 (penampang) selalu gagal `FRAMING_OUT_OF_BOUNDS` / `VISIBILITY_OUT_OF_BOUNDS`. Wheelset tampak dari depan dengan lebar ±1.084 px, sedangkan frame hanya 720 px.
2. Penyebabnya **bug kit**: `CameraRig frameEntities` tidak menyesuaikan jarak kamera dengan lebar frame 9:16. Gemini tidak bisa memperbaikinya, karena aturan A4 melarang adegan menyetel jarak kamera manual.
3. `scene-coder.ts` tetap meminta Gemini memperbaiki adegan (2 kali per adegan). Setelah gagal, run dilempar error.
4. Run diulang dari awal sekitar 10 kali, dan **setiap run membuat ulang kelima adegan**, termasuk yang sudah lolos QC. Tidak ada pemakaian ulang hasil yang sudah lolos dan tidak ada batas panggilan per video.

Ini masalah proses yang paling mahal sejauh ini. Kuota harian baru pulih pukul 00.00 Pacific (**15.00 WIB**), dan kuota dihitung per project, bukan per API key.

## Masalah 2 (kritis): bukti penampang tidak berasal dari komponen yang diklaim
Still di `out/review/p4/cross-section/` dirender dari komposisi **`DemoKereta`**, yaitu demo P3A2 dengan wheelset perspektif. Itu bukan `RailCrossSection` yang baru. Tabel jari-jarinya juga dihitung langsung dari rumus `computeWheelsetLayout`, bukan dari telemetri frame yang dirender.

`PROGRESS.md` menyebut bagian A "selesai penuh + teruji". Ini melanggar DoD butir 5.

`RailCrossSection` versi baru hanya terlihat di render QC S2 yang gagal: pandangan depan, garis jari-jari, dan badge 5×. Arahnya sudah benar, tetapi roda terpotong keluar frame.

## Masalah 3: pesan "diameter efektif" belum tersampaikan secara visual
- **Selisih terlalu kecil untuk terlihat.** Selisih jari-jari asli hanya ±1,2–1,5 mm. Pada pembesaran 5×, kedua garis jari-jari tampak sama panjang.
- **Batang di S4 ambigu.** Batang "Diameter Efektif" hanya satu, tanpa membandingkan roda luar dan roda dalam.
- **Pembagian tugas antar-shot yang tepat:**
  - **penampang** menunjukkan kerucut, flens, dan **titik kontak yang bergeser**;
  - **perbandingan** menunjukkan roda luar berputar di lingkaran efektif lebih besar dibanding roda dalam. Gambar ini harus dibesar-besarkan secara jelas dan berlabel ilustrasi.

## Masalah 4: teks HUD terlalu panjang
Setelah setia pada sumber, callout menjadi 2–3 baris, misalnya "Tanpa bentuk kerucut, inersia kendaraan membuat roda cenderung terus melaju lurus di tikungan". Dengan takarir aktif, layar akan penuh teks. Kalimat lengkap cukup di narasi dan takarir; HUD cukup berupa label pendek yang tidak melebihi sumber.

## Masalah 5: bagian B belum terbukti di keluaran
Mix, render chunk, takarir, QC final, dan `publish.md` baru diuji dengan unit test (3 test). Belum ada satu pun `final.mp4`, dan mutasi 1–12 belum dijalankan. Ini wajar karena kuota habis, tetapi statusnya memang PARTIAL, bukan "selesai".

## Keputusan
- Belum merge. Lanjut `docs/P4B-BUDGET-FIT.md` di branch yang sama.
- Bagian A dan B di P4B **tanpa panggilan Gemini**, jadi bisa dikerjakan sekarang. Bagian C (video final) dijalankan setelah kuota pulih, dengan batas panggilan yang ditegakkan kode.
- `AG-RULES.md` ditambah aturan kegagalan berulang dan asal bukti.
