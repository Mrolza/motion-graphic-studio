# Review P0b Spike (Generalisasi) — oleh Claude (advisor)

> Tanggal: 18 November 2026 · Branch: `phase/p0b-generalize` · Status review: **PARTIAL** (AG melaporkan DONE)

## Pertanyaan spike terjawab: YA, dengan syarat
Gemini bisa menyusun objek baru (piston, ring, batang penghubung, engkol, katup, busi, silinder cutaway) dari primitif umum tanpa komponen khusus. Mesinnya bisa dikenali dari still. Perbaikan dari REVIEW-P0 (format `id-ID`, ukuran teks, framing, z-fighting, commit `.agents/`) sudah dikerjakan.

## Kenapa PARTIAL: kriteria 3 (gerak mekanis benar) tidak terpenuhi di adegan
`mechanics-check.md` hanya membuktikan bahwa **fungsi** `solveCrankSlider` benar dan bahwa kode adegan **memanggil** fungsi itu. Perilaku di video tidak diperiksa. Di `Scene2_IntakeCompression`:
- `crankAngleFromTime(sec, 0, 6, 1/3)` menghasilkan **720°** (2 putaran) dalam 6 detik, padahal judul adegan "0°–360°" dan counter HUD 0→360.
- Di video, piston terlihat naik-turun **dua kali** dalam adegan "Hisap & Kompresi", jadi adegan itu sebenarnya juga memuat langkah usaha dan buang.
- Bukaan katup hisap dihitung dari waktu (`getLocalProgress(sec, 0, 3)`), bukan dari sudut engkol, sehingga tidak sinkron dengan piston (katup terbuka paling lebar di detik 1,5 saat piston sudah di titik mati bawah).
- Counter "Sudut Engkol" memakai easing sendiri, sehingga angkanya tidak sama dengan posisi engkol yang sebenarnya.

Untuk aplikasi yang fokus pada akurasi, ini persis jenis kesalahan yang harus tertangkap otomatis.

## Temuan lain
1. **Angka tanpa sumber:** `Scene4` menampilkan "Putaran mesin 1.637 → 5.991 RPM". Angka seperti ini wajib berasal dari Fact Ledger, atau diberi label "ilustrasi".
2. **Framing:** poros engkol (bagian terpenting mekanismenya) sering terpotong di bawah layar.
3. **Tumpang-tindih HUD:** `Callout` bertabrakan dengan `StatCounter` (sudah dicatat AG).
4. **Batas baris:** adegan dari primitif butuh 260–280 baris sebelum diringkas. Batas 220 terlalu ketat untuk adegan mekanis.

## Keputusan arsitektur untuk P3 (Scene Kit)
1. **Kit = primitif umum + pustaka "rakitan" yang tumbuh.** Rakitan yang sudah direview (misalnya piston + batang + engkol) disimpan sebagai komponen yang bisa dipakai ulang di topik berikutnya. Topik baru tetap bisa disusun dari primitif.
2. **Satu penggerak (single driver).** Semua bagian mekanisme dan semua angka HUD yang terkait diturunkan dari satu variabel penggerak (misalnya sudut engkol) lewat hook kit. Dilarang memakai ramp waktu terpisah untuk bagian yang secara fisik terhubung. `StatCounter` untuk besaran mekanis harus terikat ke penggerak, bukan punya easing sendiri.
3. **QC mekanis berbasis telemetri.** Adegan mengekspor status per frame (nilai penggerak, status katup, nilai HUD). QC mengambil sampel frame dan memeriksa invarian yang dideklarasikan storyboard (misalnya rentang sudut adegan, katup hisap terbuka hanya di 0°–180°, angka HUD = nilai penggerak).
4. **QC framing.** Entitas fokus yang dideklarasikan storyboard harus berada di dalam area aman layar pada frame sampel (proyeksi bounding box ke layar).
5. **Tata letak HUD berbasis zona** dengan pencegahan tumpang-tindih otomatis.
6. **Batas baris file adegan dinaikkan ke 300.**

## Catatan proses
AG menulis DONE padahal kriteria 3 hanya diperiksa di tingkat kode, bukan di hasil. Aturan DoD di `AG-RULES.md` diperjelas: bukti harus memeriksa **perilaku di output**, bukan keberadaan fungsi di kode.
