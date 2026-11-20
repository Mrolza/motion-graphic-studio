# Review P1 Fondasi — oleh Claude (advisor)

> Tanggal: 18 November 2026 · Branch: `phase/p1-foundation` · Status review: **DONE dengan tindak lanjut kecil**

## Yang terbukti
- Spike di-merge ke `main` (`p0-done`), kit dipindah ke `remotion/src/kit/` dengan `git mv`, dan still dari kit masih ter-render.
- `npm run verify` lulus: `tsc` 0 error di kedua package, 11 file / 41 test lulus, `check:size` OK, test batas modul ada.
- Modul content-studio tersalin tanpa ketergantungan ke `executor.ts`, `page.tsx`, atau Supabase. `providers.ts` (1.056 baris) dipecah dengan benar.
- `mgs doctor`, `new`, `status`, `profile` jalan. Doctor hanya menampilkan ada/tidaknya env, tanpa nilai.
- Profil perangkat terdeteksi `standar`: Arc 140V, NPU Intel AI Boost terbaca; benchmark `angle` 8,8 detik vs `swangle` 15,6 detik.

## Wajib sebelum merge (dikerjakan di awal P2)
1. **Folder `data/` belum di-gitignore.** Modul kuota menulis `data/quota.json` saat test berjalan. Tambahkan `data/` ke `.gitignore`, dan kalau sudah pernah ter-commit, hapus dari index (`git rm --cached`), bukan dari disk. Lebih baik lagi: pindahkan lokasi state kuota ke `.mgs/` dan catat di `DECISIONS.md`.
2. **Test untuk modul salinan belum lengkap.** `captions.ts` dan `cache.ts` hanya "dicakup tsc", padahal spec mewajibkan test-nya ikut. Port test caption dari `D:\content-studio\tests\render.test.ts` (bagian `buildCleanCaptions`) dan tambahkan test dasar untuk `cache.ts`.
3. **Bukti berformat UTF-16.** `verify.txt`, `doctor.txt`, `sample-status.txt`, dan `sample-project.json` di `out/review/p1/` tersimpan sebagai UTF-16 karena redirect PowerShell. Mulai sekarang simpan bukti sebagai UTF-8 (misalnya `| Out-File -Encoding utf8`, atau ditulis langsung dari Node). File di P1 cukup dikonversi ulang.

## Catatan (tidak memblokir)
- FFmpeg yang dipakai masih build 2018 (4.1) dari `@ffmpeg-installer`, sedangkan ffprobe build 2023. Keduanya jalan; batasan FFmpeg 4.1 (tanpa `xfade`, `amix normalize`) sudah ditangani modul audio-mix. Evaluasi ulang di P4.
- Di `kit-still.png`, batang penghubung tidak tersambung ke pena engkol. Wajar untuk still uji, tapi ini pengingat bahwa prinsip "satu penggerak" dan QC mekanis dari `REVIEW-P0B.md` wajib diterapkan di P3.
