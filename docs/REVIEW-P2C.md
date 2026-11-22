# Review P2C Gerbang QC — oleh Claude (advisor)

> Tanggal: 20 November 2026 · Branch: `phase/p2-facts-script` · Status review: **LOLOS, siap merge** (dengan 4 tindak lanjut kecil di awal P3A)

## Yang terbukti
- Ketiga naskah lolos Gerbang 1 dengan 0 error di semua layer. 53 test lulus.
- **Kereta:** menjawab pertanyaan (roda kerucut 1:20, inersia, diameter efektif, gandar kaku); penutup tidak lagi melebar ke "lokomotif".
- **Mesin 4 tak:** "dua putaran poros engkol penuh" sudah benar; penutup tidak lagi berupa klaim penilaian tanpa sumber.
- **Sejarah:** kini menyebut 20 Juli 1969, modul Eagle, Mare Tranquillitatis, "The Eagle has landed", Armstrong dan Aldrin, dan 600 juta penonton, bersumber dari artikel `Apollo 11`, `Lunar Module Eagle`, dan `Mare Tranquillitatis`.
- 7 skenario mutasi (mutasi 4 dan 8 digabung) tertangkap sebagai error, termasuk parafrase yang menghilangkan "dua", kalimat `non_factual` berisi penilaian, dan klaim bertanggal yang kutipannya tidak memuat tanggal.

## Tindak lanjut (dikerjakan di langkah 0 P3A)
1. **Nama di klaim belum dicek terhadap kutipan.** Klaim C2 sejarah ("Neil Armstrong dan Buzz Aldrin menjadi dua manusia pertama yang menginjakkan kaki di Bulan") berstatus `verified` dengan kutipan yang tidak menyebut Armstrong, Aldrin, maupun "dua". Faktanya benar, tapi jaminan sistem ("setiap klaim didukung kutipannya") terlanggar. Tambahkan aturan kode: nama diri di `text` klaim harus muncul di `quote` (`CLAIM_NAME_NOT_IN_QUOTE`).
2. **Hook tidak dibayar lolos L0b.** Hook naskah sejarah menjanjikan cerita tentang memori komputer pesawat yang lebih kecil dari ponsel, tapi topik itu tidak pernah dibahas. L0b memberi skor struktur 5/5. Tambahkan pemeriksaan eksplisit `hook_paid` (error kalau janji hook tidak dibahas).
3. **Nama kejadian utama tidak disebut.** Naskah sejarah tidak pernah menyebut "Apollo 11". Untuk `today_in_history`, nama kejadian/misi utama wajib muncul di narasi.
4. **Penghitung panggilan LLM menumpuk antar-run** (kereta 15, mesin 18), sehingga tidak mencerminkan biaya satu run. Catat `llm_calls_last_run` terpisah dari total kumulatif.
