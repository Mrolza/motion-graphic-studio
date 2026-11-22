# Review P4B Hemat Kuota & Kamera — oleh Claude (advisor)

> Tanggal: 21 November 2026 · Branch: `phase/p4-audio-final` · Status AG: **PARTIAL — menunggu kuota** · Status review: **A diterima; B perlu perbaikan sebelum C**

## Yang tercapai
- **0 panggilan Gemini** di fase ini, sesuai aturan.
- **Batas panggilan, cache adegan, dan `KIT_FAULT` terbukti dengan test tiruan yang jujur.** Saya membaca test-nya:
  - run pertama: S1 lolos (1 panggilan), S2 kena error milik kit dengan 0 panggilan S9, lalu run berhenti;
  - run ulang: S1 dipakai ulang (0 panggilan), hanya S2 dan S3 yang dibuat (2 panggilan).
- **Kamera 9:16 sudah memuat wheelset utuh.** `RailCrossSection` kini masuk frame (isi 49%), begitu juga `TrainCar`, `WheelsetOnRail`, dan `PistonCrankAssembly`.
- **`EffectiveDiameterCompare` bekerja:**
  - roda luar lebih besar, tanda mengikuti arah geser, sama besar di tengah;
  - label "Roda luar/Roda dalam", badge ilustrasi, tanpa angka.
- **Bukti dirender dari `DemoCrossSection`.** DoD 6 sudah dipatuhi.
- **`HUD_TOO_LONG` dan pra-cek kata mutlak bekerja.**

## Temuan yang wajib diperbaiki sebelum bagian C (semua tanpa Gemini)

**F1 (kritis). Titik kontak di penampang hanya hiasan, bukan geometri**
- Di `RailCrossSection.tsx`, posisi titik kontak dihitung sebagai `posisi rel + lateralShift × 1.4`. Faktor 1.4 itu karangan.
- Akibatnya, pada geser maksimum **titik kontak melayang di luar kepala rel**: di kiri rel pada `shift-left` dan di tepi kanan rel pada `shift-right`.
- Roda hanya bergeser ke samping tanpa naik-turun mengikuti kerucutnya. Batang kuning di dalam roda panjangnya tetap.
- Jadi penampang belum memperlihatkan *mengapa* jari-jari efektif berubah.

Perbaikan:
- Titik kontak = perpotongan profil tapak (yang sudah dibesarkan) dengan permukaan kepala rel.
- Rel diam; wheelset bergeser ke samping. Tinggi tiap roda mengikuti jari-jari di titik kontaknya, sehingga roda bertumpu di rel. Gandar boleh miring sebagai akibatnya, dalam skala yang dibesarkan.
- Ganti batang kuning dengan **garis jari-jari** dari pusat gandar ke tiap titik kontak.
- QC geometri:
  - titik kontak berada di dalam lebar kepala rel **dan** di garis tapak (≤ 2 px);
  - roda menembus rel ≤ 1 px;
  - pada geser maksimum, garis jari-jari roda luar ≥ 5% lebih panjang dari roda dalam (px dari telemetri);
  - di posisi tengah keduanya sama (±1 px).
- Bukti: 3 still ditambah **crop zoom area kontak**, beserta tabel jarak kontak-ke-rel dan panjang garis jari-jari dari telemetri.

**F2. Matriks framing terlalu longgar**
- `EngineBlock` setinggi 740–810 px melampaui zona bebas (±560 px) dan masuk ke zona HUD/takarir, tetapi tetap ditulis PASS. Isi zona bebasnya 88–96%.
- `Suspension` hanya mengisi 6–7% frame, tetapi juga PASS.

Perbaikan:
- Periksa containment terhadap **zona bebas** (bukan area aman).
- Pakai pita isi default 35–75% untuk `frameEntities`; aturan establishing ≥ 30% tetap berlaku.
- Status ditulis jujur: PASS, WARN, atau FAIL.
- Perbaiki fit kamera sampai `EngineBlock` dan `Suspension` lolos.

**F3. Mutasi 4 tidak lengkap**
`SHOT_VIEW_MISMATCH` tidak muncul. Ringkasan mutasi menulis "undefined", dan hanya `VIS_EXAGGERATION_UNLABELED` yang terhitung. Perbaiki pemeriksaannya, lalu ulangi mutasi 4 sampai kedua kode muncul.

**F4 (kecil)**
- Baris mutasi 14–15 di ringkasan ditulis manual. Perilakunya memang terbukti di unit test, tetapi baris ringkasan harus dibuat dari hasil test.
- Lingkaran roda luar di panel perbandingan 47% lebih besar, padahal narasi berkata "sedikit lebih jauh". Turunkan ke **15–25%** agar tetap terlihat tanpa melebih-lebihkan kesan.

## Keputusan
Kerjakan F1–F4 dulu (tanpa Gemini, bisa sekarang). Setelah itu jalankan bagian C `docs/P4B-BUDGET-FIT.md` saat kuota pulih (15.00 WIB). Merge baru dilakukan setelah ada `final.mp4` yang lolos QC final.
