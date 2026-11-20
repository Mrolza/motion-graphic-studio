# Review P2 Fakta & Naskah — oleh Claude (advisor)

> Tanggal: 19 November 2026 · Branch: `phase/p2-facts-script` · Status review: **PARTIAL** (setuju dengan laporan AG, tapi dengan masalah tambahan yang lebih penting)

## Yang terbukti bekerja
- Tindak lanjut P1 beres dan P1 sudah di-merge (`p1-done`).
- **Mesin akurasi bekerja:** L1 menangkap URL sumber karangan (`https://wikipedia.org`, `SOURCE_NOT_FOUND`) dan kutipan yang dipotong (`QUOTE_NOT_IN_SOURCE`). L2 dan L3 menangkap mutasi angka palsu. 49 test lulus, smoke call Gemini berhasil.
- Setiap kalimat naskah kereta memang punya rujukan ke kutipan asli Wikipedia.

## Masalah utama: naskah akurat tapi tidak menjawab pertanyaan
Topik: **"Kenapa kereta tidak tergelincir?"** Naskah yang lolos Gerbang 1 justru membahas bogie K9 milik satu kereta tertentu (KA Anggrek) yang **sering anjlok**, lalu perbaikannya oleh INKA. Tidak ada penjelasan tentang flens roda, roda berbentuk kerucut, atau lebar rel, padahal itu inti jawabannya. Naskah ini **benar secara fakta, tapi salah sebagai konten**.

Akar masalahnya:
1. **Riset salah sasaran.** Pencarian Wikipedia berbahasa Indonesia mengembalikan halaman "Kereta api Anggrek", bukan artikel teknis (wheelset, flange, track gauge, derailment). Wikipedia Indonesia tipis untuk topik teknik.
2. **Logika L0 terbalik.** Konsep 0 dan 1 (yang mungkin menjawab pertanyaan) ditolak karena klaim intinya tidak ada di sumber yang kebetulan terambil. Akibatnya pipeline memilih konsep yang **cocok dengan sumber yang ada**, bukan mencari sumber untuk konsep yang benar.
3. **Tidak ada QC relevansi.** Tidak ada pemeriksaan apakah naskah menjawab pertanyaan topik.
4. **Generalisasi berlebihan lolos L3.** "Rangkaian kereta api menggunakan kerangka khusus yang disebut bogie" dan "Komponen ini memanfaatkan suspensi udara" diturunkan dari klaim tentang satu model bogie tertentu (CL243), tapi dinilai `supported`.
5. **Uji mutasi terlalu mudah.** Angka 9.999 km/jam dan "mustahil tergelincir selamanya" terlalu mencolok. QC harus dibuktikan menangkap kesalahan yang halus.
6. **Prompt scriptwriter terlalu tipis.** File baru (±2 KB) hanya berisi aturan fakta. Panduan bercerita dari v2.2 (hook yang dibayar, jawaban di awal, rantai penjelasan, payoff) hilang.
7. **Naskah terlalu pendek.** Sekitar 70 kata untuk target 45 detik (seharusnya ±95–115 kata).

## Masalah operasional
- 2 dari 3 topik tidak jalan karena Gemini 503 berkepanjangan. Perlu backoff yang lebih sabar, model cadangan opsional, dan kemampuan melanjutkan dari tahap terakhir tanpa mengulang panggilan.

## Keputusan
P2 belum di-merge. Perbaikan dikerjakan di `docs/P2B-RELEVANCE.md` pada branch yang sama, lalu ketiga topik dijalankan ulang.
