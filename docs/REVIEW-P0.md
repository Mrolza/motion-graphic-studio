# Review P0 Spike — oleh Claude (advisor)

> Tanggal: 18 November 2026 · Branch: `phase/p0-spike` · Status review: **LOLOS secara teknis, dengan catatan kualitas**

## Yang terbukti
- Low-poly 3D jalan di laptop pemilik: adegan 6 detik dirender 7,1 detik (`angle`, concurrency 4). Video 24 detik dirender 38 detik.
- Tanpa GPU (`swangle`) hanya ±2,4× lebih lambat (17 detik untuk adegan yang sama), dan hasilnya identik secara visual (98,56% piksel dalam toleransi). Profil Hemat layak.
- Gemini (`gemini-3.5-flash-lite`) menulis 4/4 adegan yang lolos validator tanpa perbaikan, 4 panggilan total.
- Proses AG sesuai `AG-RULES.md`: branch, tag, bukti di `out/review/p0/`, file < 400 baris.

## Catatan yang harus ditangani di fase berikutnya
1. **Format angka salah untuk bahasa Indonesia (kritis untuk akurasi).** HUD menampilkan `1,435 mm`, padahal dalam bahasa Indonesia itu terbaca "satu koma empat tiga lima". Caption sudah benar (`1.435 mm`). Semua angka di HUD wajib diformat dengan `Intl.NumberFormat('id-ID')`, dan QC L5 harus menangkap ketidakcocokan format antara HUD dan narasi.
2. **Animasi counter yang menyesatkan.** Angka lebar rel naik dari 1.310 ke 1.435, seolah-olah lebar rel berubah. Untuk besaran yang tetap (dimensi, standar), pakai animasi "pengukuran" (garis ukur memanjang lalu angka muncul). Count-up hanya untuk besaran yang memang naik atau turun.
3. **Koherensi fisik.** Pegas di adegan 4 melayang di atas roda tanpa rangka bogie atau badan kereta. Roda di adegan 2 tidak jelas menapak di kepala rel. Objek mekanis harus tersambung secara logis.
4. **Z-fighting** pada flens dan muka roda (pola garis gelap saat berputar). Sudah dicatat AG; perbaiki di Scene Kit.
5. **Teks terlalu kecil untuk layar HP.** Judul, callout, dan caption terlalu kecil di 720×1280. Tetapkan ukuran minimum: judul ≥ 44 px, caption ≥ 32 px, callout ≥ 26 px (di lebar 720), dalam area aman.
6. **Komposisi.** Kereta di adegan 1 terpotong dan sepertiga atas layar sering kosong. Rig kamera perlu preset framing untuk 9:16 (subjek di tengah-bawah, ruang atas untuk judul).
7. **Belum ada kedalaman latar depan.** Referensi terasa hidup karena tiang dan objek lewat di depan kamera. Tambahkan elemen foreground/parallax di Scene Kit.
8. **`.agents/` belum di-commit.** Folder skill harus ikut repo supaya terbawa ke laptop kantor.

## Catatan penting soal hasil 4/4
Adegan lolos 100% karena Scene Kit dibuat khusus untuk topik kereta (`Axle`, `Rail`, `TrainCar`). Gemini hanya mengatur komponen yang sudah jadi. Ini belum membuktikan bahwa Gemini bisa membuat adegan untuk topik baru yang tidak punya komponen khusus. Itu diuji di `docs/SPIKE-2.md`.
