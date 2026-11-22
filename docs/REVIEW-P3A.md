# Review P3A Scene Kit — oleh Claude (advisor)

> Tanggal: 20 November 2026 · Branch: `phase/p3a-scene-kit` · Status review: **PARTIAL** (AG melaporkan DONE)

## Yang terbukti
- Tindak lanjut P2 beres dan P2 sudah di-merge (`p2-done`). `CLAIM_NAME_NOT_IN_QUOTE`, `hook_paid`, nama kejadian utama, dan `llm_calls_last_run` berjalan.
- **Infrastruktur telemetri bekerja dan jujur:** mutasi benar-benar dirender ulang (telemetri dan waktu render berbeda dari versi normal), bukan sekadar data yang dimanipulasi.
- **Mekanika demo mesin benar:** satu penggerak 0°–720°; piston turun di hisap, naik di kompresi, turun di usaha, naik di buang; status katup dan label langkah sinkron; HUD sudut engkol terikat ke penggerak.
- 5 mutasi QC tertangkap. Overhead telemetri kecil (2–21%). Render cepat (16 detik video dalam ±14 detik).

## Masalah: QC lolos, tapi gambarnya salah atau tidak menjelaskan
1. **Wheelset tidak menapak rel.** Di demo kereta, dua roda hampir bersentuhan satu sama lain (gandar sangat pendek, bukan selebar sepur), duduk di tengah jalur, dan bidang roda tidak sejajar arah rel. Rakitan `WheelsetOnRail` salah secara geometri, dan tidak ada QC yang bisa menangkapnya karena QC mekanis hanya memeriksa invarian yang dideklarasikan.
2. **HUD menutupi bagian penting.** Di demo mesin, poros engkol (bagian yang mengubah gerak naik-turun menjadi putaran) hampir selalu tertutup tumpukan panel HUD. Di demo kereta, panel menutupi separuh bawah roda. QC `framing` lolos karena hanya mengecek bounding box entitas di area aman, bukan apakah bagian pentingnya terlihat.
3. **Demo kereta tidak menjelaskan apa-apa.** Konsep yang sudah lolos cek fakta di P2 (roda kerucut 1:20, inersia di tikungan, diameter efektif roda luar lebih besar) tidak divisualkan. Kerucutnya tidak terlihat, tidak ada tikungan, dan HUD "Jarak Tempuh −1,6 m" tidak bermakna. Callout "Kontak Tapak Kerucut — Lebar rel 1.435 mm" mencampur dua hal yang tidak berhubungan.
4. **Terlalu banyak panel HUD sekaligus.** Tiga panel bertumpuk di sepertiga bawah layar dan memakan ±40% tinggi frame.
5. **Katup dan percikan busi terlalu kecil** untuk dilihat di layar HP.
6. **Aturan nama L1 terlalu ketat:** "Neil Armstrong" ditolak karena kutipan hanya menulis "Armstrong". Nama belakang saja seharusnya cukup.

## Pelajaran
QC yang ada membuktikan bahwa **angka dan status** benar, tapi belum membuktikan bahwa **gambarnya benar dan terbaca**. Dua lapis yang hilang: geometri (benda tersambung dan menapak dengan benar) dan keterlihatan (bagian penting tidak tertutup). Selain itu, demo harus menjelaskan klaim dari naskah, bukan sekadar menampilkan objek bergerak.

## Keputusan
P3A belum di-merge. Perbaikan di `docs/P3A2-VISUAL-TRUTH.md`, branch yang sama.
