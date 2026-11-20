# P2C — Menutup Celah QC dan Gerbang 1

> Fase: **P2C** · Lanjutkan di branch `phase/p2-facts-script` · Baca `docs/AG-RULES.md` dan **`docs/REVIEW-P2B.md`**.
> Perbaikan kecil dan terarah. Jangan mengubah hal lain yang sudah bekerja.

## 1. Aturan blokir Gerbang 1 yang tegas (`gate1.ts`)
`mgs approve` **ditolak** kalau ada salah satu dari ini:
- error apa pun di L0, L0b, L2, atau L3;
- naskah merujuk klaim yang tidak `verified`.

Error L1 pada klaim yang **tidak dipakai** naskah diturunkan menjadi `info` ("klaim dibuang"), supaya tidak mengganggu, tapi tetap tercatat. Tulis test untuk setiap aturan.

## 2. L0 benar-benar memeriksa klaim inti
- Panggilan ekstraksi klaim (yang sudah ada) juga mengembalikan pemetaan `core_claim_support`: untuk setiap klaim inti, daftar ID klaim ledger yang mendukungnya.
- Kode memeriksa bahwa setiap klaim inti punya minimal satu pendukung berstatus `verified`. Kalau tidak → jalankan putaran riset tambahan (P2B bagian 2), lalu periksa lagi. Masih tidak → `concept_unverifiable` (error L0).
- Test dengan fixture kasus sejarah: klaim inti tanpa pendukung harus menghasilkan error L0 dan memicu riset tambahan.

## 3. Klaim harus didukung kutipannya (L1, kode)
- **Setiap angka dan tahun di `text` klaim harus muncul di `quote`** (sadar format angka dan nama bulan en/id: "20 Juli" ↔ "July 20"). Tidak muncul → `unverified`, alasan `CLAIM_FACT_NOT_IN_QUOTE`.
- `quote` harus berupa kalimat utuh dari sumber (diawali huruf kapital atau awal kalimat, diakhiri tanda baca), bukan potongan frasa. Potongan → `unverified`, alasan `QUOTE_FRAGMENT`.
- Di panggilan verifier L3 yang sudah ada, tambahkan pemeriksaan bahwa `text` setiap klaim yang dirujuk naskah memang didukung `quote`-nya.

## 4. Today in history: kejadian utama wajib ada
- Setelah kejadian dipilih dari On This Day, **wajib ambil artikel utama kejadian itu** (halaman pertama di `pages[]` kejadian, misalnya `Apollo 11`) sebelum artikel turunan seperti peringatan/anniversary.
- Struktur format `today_in_history`: adegan 1–2 wajib menyebut kejadian utama lengkap dengan tanggal dan tahunnya (misalnya "20 Juli 1969, Apollo 11 mendarat di Bulan"), bersumber dari artikel utama.
- L0b untuk format ini: kejadian utama tidak disebut dengan tanggal dan tahun → error.

## 5. Celah `non_factual`
- Prompt scriptwriter: `non_factual` hanya untuk pertanyaan retoris, transisi, dan ajakan. Pernyataan tentang subjek (termasuk penilaian seperti "efisien", "andal", "tercanggih") **bukan** `non_factual`.
- Verifier L3 juga memeriksa kalimat `non_factual`: kalau berisi pernyataan faktual atau penilaian tentang subjek → error `NON_FACTUAL_ASSERTION`.

## 6. Parafrase yang mengubah makna
Tambahkan ke prompt verifier L3: kalimat yang **menghilangkan atau mengubah informasi sehingga maknanya berubah** dibanding kutipan (misalnya "dua putaran" menjadi "putaran penuh", "sebagian besar" menjadi "semua", "wheelset" menjadi "lokomotif") dinilai `overstated` atau `unsupported`.

## 7. Adegan menyimpang = error
L0b: skor `on_topic` < 3, atau ada adegan yang dinilai tidak relevan dengan topik → error (bukan warning).

## 8. Laporan jujur
`stats.md` dan `docs/PROGRESS.md` wajib mencantumkan **semua** isu yang tersisa per layer (L0, L0b, L1, L2, L3) dengan severity-nya, bukan hanya L2/L3.

## 9. Uji ulang
- **Sejarah:** jalankan ulang penuh (`mgs run --until gate1`) untuk `07-20` sebagai proyek baru.
- **Kereta dan mesin:** jalankan ulang hanya S4 (QC) pada naskah yang ada dengan aturan baru. Catat isu baru yang muncul (yang diharapkan: mesin S2.1 dan S4.1, kereta S5.1), lalu biarkan 1 kali penulisan ulang otomatis, dan catat hasil akhirnya.

## 10. Mutasi tambahan (`out/review/p2/mutation-test/`)
Selain 4 mutasi yang ada, tambahkan dan buktikan **semuanya tertangkap sebagai error** (bukan warning):
5. Parafrase yang menghilangkan kuantitas: "dua putaran poros engkol" → "putaran poros engkol penuh".
6. Kalimat `non_factual` yang berisi penilaian: "Mesin ini adalah desain paling efisien yang pernah dibuat."
7. Klaim ledger dengan tanggal yang tidak ada di kutipannya (uji L1 bagian 3).
8. Ulangi mutasi 4 (adegan menyimpang); sekarang harus error.

## Kriteria lolos
1. `npm run verify` lulus, termasuk test baru untuk bagian 1–3.
2. Ketiga naskah lolos Gerbang 1 dengan **0 error di semua layer** setelah maksimal 1 kali penulisan ulang.
3. Naskah sejarah menyebut "20 Juli 1969" dan pendaratan Apollo 11, bersumber dari artikel `Apollo 11`.
4. Mutasi 1–8 tertangkap sebagai error.
5. Laporan mencantumkan semua isu yang tersisa per layer.

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch, lalu **berhenti**.
