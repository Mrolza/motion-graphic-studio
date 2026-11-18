# Aturan Kerja AG — Motion-Graphic Studio

Berlaku untuk **setiap** sesi AG di repo ini. Baca sebelum mulai bekerja.

## 1. Lingkup dan checkpoint
- Kerjakan **hanya fase yang diminta** dalam prompt. Satu fase per run.
- Setelah fase selesai: tulis laporan di `docs/PROGRESS.md`, commit, push branch, lalu **berhenti**. Jangan lanjut ke fase berikutnya tanpa perintah pemilik.
- Jangan bertanya di tengah run. Kalau ada keputusan kecil, ambil yang paling aman dan catat di `docs/DECISIONS.md`. Kalau ada keputusan besar (mengubah PRD, menambah dependensi berbayar, mengubah arsitektur), berhenti dan laporkan.

## 2. Git
- Setiap fase di branch sendiri: `phase/<kode>-<nama>`, misalnya `phase/p0-spike`. Jangan commit langsung ke `main`.
- Buat tag `<kode>-start` di awal fase.
- Commit kecil per tugas, pesan jelas dalam bahasa Inggris atau Indonesia.
- **Dilarang:** `git push --force`, `git reset --hard`, `git clean`, menghapus branch orang lain, mengubah riwayat.
- Penggabungan ke `main` hanya setelah pemilik menyetujui.

## 3. Rahasia dan keamanan
- **Jangan pernah membaca, menampilkan, atau mengubah `.env.local`.** Nama variabel env baru ditulis di `.env.example` tanpa nilai.
- API key tidak boleh masuk kode, log, atau commit. Tidak ada prefix `NEXT_PUBLIC_` untuk key.
- Tidak memakai provider berbayar tanpa izin tertulis pemilik.

## 4. Struktur kode
- Batas **±400 baris per file** (kecuali fixture test dan file hasil generate). Kalau lewat, pecah.
- Inti mesin (`src/core/`) tidak boleh mengimpor apa pun dari UI (`src/app/`, `src/components/`).
- Satu tahap pipeline = satu modul dengan kontrak masukan/keluaran yang diketik (TypeScript strict).
- Tidak ada implementasi palsu, stub, atau `TODO` yang dilaporkan sebagai selesai.

## 5. Definisi selesai (Definition of Done)
Sebuah fase hanya boleh ditulis **DONE** jika:
1. `tsc --noEmit` 0 error dan semua test lulus.
2. Fase yang menyentuh UI: smoke test Playwright lulus.
3. Ada **bukti yang bisa dilihat** di `out/review/<fase>/`: still, video, atau screenshot.
4. Semua kriteria fase teruji. Kalau ada yang tidak teruji, tulis **PARTIAL** beserta daftar yang belum dan alasannya.
5. Bukti harus memeriksa **perilaku di output** (frame, nilai, file hasil), bukan sekadar keberadaan fungsi atau pemanggilan di kode. Contoh: "gerak piston benar" dibuktikan dengan nilai posisi piston di frame sampel dibandingkan dengan perhitungan, bukan dengan "kode memanggil `solveCrankSlider`".

## 6. Pengujian langkah panjang
- Langkah yang memanggil LLM atau render bisa memakan menit. Gunakan polling atau timeout klien minimal 10 menit.
- Timeout di alat uji **bukan** bukti aplikasi gagal. Ulangi sekali dengan timeout lebih panjang sebelum menyimpulkan.
- Kalau kuota API habis, berhenti dan laporkan apa yang sudah selesai.

## 7. Dokumen
- `docs/PRD.md` **tidak boleh diubah** oleh AG.
- `docs/PROGRESS.md`: log singkat per fase (apa yang dibuat, bukti, status, catatan untuk pemilik).
- `docs/DECISIONS.md`: keputusan kecil yang diambil sendiri dan usulan perubahan PRD.

## 8. Lisensi
- Hanya dependensi dan aset berlisensi bebas (MIT, Apache-2.0, BSD, OFL, CC0, domain publik). Catat di `THIRD_PARTY_NOTICES.md`.
- Hati-hati dengan lisensi AGPL/GPL dan model AI non-komersial: jangan dipakai tanpa izin pemilik.
