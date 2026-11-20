# Review P2B Relevansi — oleh Claude (advisor)

> Tanggal: 20 November 2026 · Branch: `phase/p2-facts-script` · Status review: **PARTIAL** (AG melaporkan selesai)

## Kemajuan besar
- **Naskah kereta sekarang benar-benar menjawab pertanyaan:** roda kerucut 1:20, inersia di tikungan, diameter efektif, dan gandar kaku. Semuanya dari artikel `Wheelset (rail transport)`.
- **Naskah mesin 4 tak menjelaskan keempat langkah dengan benar,** bersumber dari `Four-stroke engine` dan `Otto cycle`.
- Riset berdasarkan judul artikel + Wikipedia Inggris bekerja; sumber tidak relevan dibuang dengan alasan yang masuk akal.
- 4 mutasi tertangkap; panggilan LLM rata-rata 8 per topik.

## Celah yang ditemukan (harus ditutup sebelum merge)
1. **Gerbang 1 meloloskan naskah yang punya error.** Naskah sejarah di-APPROVE padahal L0b melaporkan `ERROR L0B_LOW_SCORE` (coverage 2/5). Naskah kereta juga di-APPROVE dengan error L1 (meskipun klaim itu tidak dipakai). Aturan blokir Gerbang 1 belum konsisten.
2. **L0 tidak benar-benar memeriksa klaim inti.** Untuk sejarah, klaim inti (modul Eagle, durasi berjalan di Bulan, dst.) tidak didukung ledger, tapi L0 melaporkan 0 isu dan riset tambahan tidak berjalan. Hanya L0b yang menyadarinya.
3. **Isi klaim tidak dicek terhadap kutipannya.** Klaim C2 sejarah ("Tanggal 20 Juli dikaitkan dengan peringatan pendaratan pertama di Bulan") berstatus `verified` dengan kutipan potongan "the 50th anniversary of the first Moon landing", yang tidak menyebut tanggal sama sekali. L1 hanya memastikan kutipan ada di sumber, bukan bahwa kutipan mendukung klaim.
4. **Naskah sejarah melewatkan kejadian utamanya.** Naskah membahas upacara 1979, pertemuan dengan Obama 2009, Soyuz 2019, dan festival, tapi tidak pernah menyebut **20 Juli 1969, Apollo 11 mendarat di Bulan**. Artikel utama `Apollo 11` tidak diambil; yang diambil `Apollo 11 anniversaries`, `Soyuz MS-13`, dan `International Space Station`.
5. **Celah `non_factual`.** Mesin S4.1: "Desain mekanis yang teratur ini membuat mesin empat langkah sangat efisien dan andal" ditandai `non_factual`, padahal itu klaim penilaian yang tidak bersumber. Label `non_factual` bisa dipakai untuk menyelundupkan klaim.
6. **Parafrase yang mengubah makna lolos.** Mesin S2.1: "memerlukan putaran poros engkol penuh", padahal sumber (C6) menyebut **dua** putaran. Kata "dua" hilang dan maknanya berubah.
7. **Kalimat penutup kereta melebar.** S5.1 menyebut "lokomotif" dan "tanpa setir mekanis", padahal sumber berbicara tentang wheelset secara umum dan tidak menyebut setir.
8. **Adegan yang menyimpang hanya jadi warning.** Mutasi 4 (adegan tentang sayap pesawat) "tertangkap" L0b sebagai warning, jadi tidak memblokir Gerbang 1.
9. **Laporan tidak lengkap.** `stats.md` dan ringkasan AG menulis "0 error L2/L3, APPROVED" tanpa menyebut error L0b yang masih ada.

## Keputusan
P2 belum di-merge. Tutup celah di `docs/P2C-GATES.md` (perbaikan kecil, branch yang sama).
