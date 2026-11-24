# Review P4F Domain Kit & Cek Visual Jujur — oleh Claude (advisor)

> Tanggal: 22 November 2026 · Branch: `phase/p4f-domain-safety` · Status AG: **DONE** · Status review: **Teknik lolos, boleh di-merge. Narasi mesin belum layak tayang: akurat tetapi kaku dan membingungkan.**

## Yang tercapai (saya cek ulang)
- **Visual sesuai topik.** Tidak ada lagi komponen kereta di video mesin. `RailCurveOverlay` dipisah ke domain `rail`, dan storyboard mesin hanya memakai `engine_block`, `cylinder_section`, dan `piston_crank`.
- **`CylinderSection` benar.** Pada 8 sudut, posisi piston (TMA di 0/360°, TMB di 180/540°), katup masuk terbuka 0–180°, katup buang terbuka 540–720°, dan busi menyala di 360° semuanya cocok. Warna ruang bakar berubah per langkah.
- **Cek visual dan render lebih ketat:**
  - panah dicek per frame (61/61);
  - HUD tidak terpotong;
  - larangan `Math.random`/`Date.now`/`useFrame` aktif;
  - satu suara (`id-ID-ArdiNeural`) untuk semua adegan;
  - spam `THREE.Clock` disaring;
  - `tsc` dipanggil tanpa shell.
- **Teknis mesin** (saya ukur): −14,1 LUFS, `yuv420p`, 1314 frame, tanpa hening ≥ 0,4 detik.
- **Kereta P4E tetap lolos** pada QC aturan baru (domain, panah, teknis). Kegagalan B2 hanya karena ledger P4E belum memakai `step_id`. **Video itu tetap layak tayang.**
- **Panggilan Gemini:** 47 di fase ini (target 40). Kelebihannya dilaporkan jujur beserta penyebabnya.

## Masalah utama: narasi mesin berubah jadi terjemahan harfiah Wikipedia
Gerbang fakta sudah ketat, tetapi penulis naskah kini **menyalin kutipan kata per kata** sehingga penonton tidak bisa mengikuti:

| Kalimat | Masalah |
|---|---|
| "Siklus Otto adalah siklus termodinamika ideal yang menggambarkan fungsi mesin piston pengapian percikan khas." | Terjemahan kaku ("mesin piston pengapian percikan khas") |
| "**Langkah tersebut** menghasilkan kerja mekanis…" | Langkah tenaga/usaha **tidak pernah disebut namanya**. Penonton tidak tahu "langkah tersebut" yang mana, dan gas yang mendorong piston ke bawah tidak dijelaskan |
| "Selama langkah buang, piston bergerak **dari satu titik ke titik lain**…" | Kosong makna. Kutipan Wikipedia-nya sendiri kontradiktif ("heads downwards… B.D.C. to T.D.C."), jadi penulis menghindari arah gerak |
| "Dengan asumsi seluruh empat langkah memerlukan rotasi 720 derajat, poros engkol telah menyelesaikan satu revolusi penuh 360 derajat **pada titik tertentu**." | Kalimat penutup tanpa konteks, diambil dari tengah artikel |

Tidak ada kalimat yang salah fakta, tetapi videonya tidak menjelaskan. Penyebabnya:
1. **Riset memilih kutipan yang tidak berdiri sendiri.** Banyak kutipan berisi kata rujukan ("this stroke", "at this point"), asumsi dalam kurung, atau isi yang saling bertentangan. Ledger sebelumnya punya kutipan yang lebih jernih, misalnya Otto cycle "The intake stroke and compression stroke require one rotation… The power stroke and exhaust stroke require another rotation" dan "the piston moves upward expelling the combustion gases".
2. **Tidak ada gerbang kejelasan** yang mengimbangi gerbang fakta.
3. **`coverage.md` menganggap "Langkah tersebut menghasilkan kerja mekanis" sebagai kalimat khusus langkah usaha**, padahal nama langkahnya tidak disebut.

## Catatan kecil
- `TEXT_UNKNOWN_WORD: Total` adalah false positive, karena kamus id-ID belum lengkap.
- `HUD_DUPLICATES_CAPTION` muncul di 5 callout. Callout berupa frasa kunci dari takarir itu wajar, jadi ambang 70% terlalu sensitif untuk callout ≤ 5 kata.

## Penilaian jujur arah proyek
Sejak P4, setiap pengetatan memunculkan masalah baru di tempat lain: fakta ketat menghilangkan isi, isi kembali tetapi visualnya salah topik, visual benar tetapi narasinya kaku. Mesin dan pemeriksaannya sekarang kokoh. Yang tersisa adalah **kualitas tulisan di bawah batasan fakta**, dan ini lebih efektif diselesaikan dengan:
1. pemilihan kutipan yang jernih;
2. aturan kejelasan yang sederhana;
3. **pemilik bisa menyunting naskah di Gerbang 1.** Pemeriksaan fakta dijalankan ulang otomatis hanya pada kalimat yang disunting.

Tidak perlu menambah lapisan gerbang otomatis lagi.

## Keputusan
- Merge P4F ke `main` (tag `p4f-done`).
- Lanjut `docs/P4G-SCRIPT-CLARITY.md` (fase kecil). Setelah itu **P5 (UI web)**.
- Video yang layak tayang sekarang hanya **kereta P4E**. Untuk mesin, tunggu hasil P4G.
