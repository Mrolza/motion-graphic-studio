# P2 — Fakta & Naskah (S1–S4, Fact Ledger, QC L0–L3, Gerbang 1 via CLI)

> Fase: **P2** · Branch: `phase/p2-facts-script` · Baca dulu `docs/AG-RULES.md`, `docs/PRD.md` (bagian 5 dan 6), `docs/REVIEW-P1.md`.
> Tujuan: dari sebuah topik, aplikasi menghasilkan **naskah yang setiap faktanya bisa dilacak ke kutipan asli dari sumber**, lengkap dengan laporan QC. Ini inti produk. **Belum ada visual, audio, atau UI web.**

## 0. Tindak lanjut P1, lalu merge
1. Di branch `phase/p1-foundation`, kerjakan tindak lanjut dari `docs/REVIEW-P1.md` (bagian "Wajib sebelum merge").
2. `npm run verify` lulus → merge P1 ke `main` (`--no-ff`), tag `p1-done`, push.
3. Buat branch `phase/p2-facts-script` dari `main`, tag `p2-start`.
4. Jalankan **satu smoke call nyata** `generateJson` ke Gemini dengan prompt kecil. Fase ini butuh LLM sungguhan; kalau smoke call gagal karena kuota atau key, berhenti dan laporkan.

## 1. S1 Ide — `src/core/stages/ideate.ts`
- Masukan: `topic`, `format`. Keluaran: 3 konsep, masing-masing berisi `title`, `angle` (sudut cerita), `hook`, `core_claims[]` (3–5 pernyataan faktual yang menjadi tulang punggung konsep), dan `search_queries[]` (kata kunci riset, id dan en).
- Instruksi prompt: hindari mitos populer dan klaim yang tidak bisa diverifikasi; untuk `what_if`, premis boleh hipotetis tapi `core_claims` harus fakta nyata yang mendasari skenario.
- 1 panggilan LLM.

## 2. S2 Riset & Fact Ledger — `src/core/stages/research.ts`
### 2.1 Pengambilan sumber (tanpa API key)
- **Wikipedia**: pencarian lewat `https://{lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=...&format=json`, lalu teks penuh lewat TextExtracts (`prop=extracts&explaintext=1`). Bahasa `id` dan `en`. Ambil maksimal 4 halaman paling relevan per konsep; potong per halaman maksimal ±30.000 karakter (utamakan bagian awal dan bagian yang memuat kata kunci).
- **today_in_history**: pakai modul `wikimedia.ts` (On This Day) yang sudah disalin, lalu halaman Wikipedia dari kejadian terpilih.
- Header `User-Agent` wajib sesuai kebijakan Wikimedia (pakai yang sudah ada di modul wikimedia).
- Simpan setiap sumber mentah ke `projects/<id>/sources/<source_id>.json` (url, judul, bahasa, teks, waktu ambil). Teks sumber inilah yang dipakai pemeriksaan L1.

### 2.2 Ekstraksi klaim
- Gemini menerima teks sumber (dengan `source_id`), konsep, dan `core_claims`. Keluaran: daftar klaim sesuai kontrak `FactLedger`, dengan `quote` **disalin apa adanya** dari teks sumber, `text` dalam bahasa Indonesia, dan `value`/`unit` untuk angka.
- Kalau teks sumber terlalu panjang untuk satu panggilan, bagi per sumber (maksimal 2 panggilan).

### 2.3 Pemeriksaan L1 (kode, bukan LLM) — `src/core/qc/l1-ledger.ts`
- Normalisasi spasi, tanda kutip, dan tanda hubung di `quote` dan teks sumber, lalu **`quote` harus merupakan substring dari teks sumber `source_id`-nya**. Kalau tidak → klaim `unverified`, alasan `QUOTE_NOT_IN_SOURCE`.
- Kalau klaim punya `value`, angka itu harus muncul di `quote`, dengan memperhitungkan format angka bahasa sumber (`1,435` di sumber en = `1.435` di id = 1435). Kalau tidak → `unverified`, alasan `VALUE_NOT_IN_QUOTE`.
- Simpan ke `projects/<id>/fact-ledger.json` dan `projects/<id>/qc/L1.json`.

### 2.4 Pemeriksaan L0
- Setelah L1, setiap `core_claims` konsep terpilih harus didukung minimal satu klaim `verified`. Kalau ada core claim yang tidak didukung → konsep ditandai `concept_unverifiable`, dan CLI menyarankan konsep berikutnya.

## 3. S3 Naskah — `src/core/stages/script.ts`
- Salin `docs/SCRIPTWRITER-SYSTEM-PROMPT-v2.md` dari `D:\content-studio\docs\` ke `src/core/prompts/scriptwriter.md`, lalu sesuaikan dengan kontrak `Script` yang baru:
  - setiap kalimat faktual membawa `claim_refs` yang **hanya** merujuk klaim `verified`;
  - kalimat non-faktual (hook retoris, transisi) ditandai `non_factual: true` dan tidak boleh berisi angka, tanggal, atau nama;
  - klaim `kind: interpretation` boleh dipakai, tapi kalimatnya harus terbaca sebagai penafsiran;
  - untuk `what_if`, bagian hipotetis memakai bahasa pengandaian.
  Bagian prompt tentang visual (beat, `visual_state_en`) tidak dipakai di fase ini.
- Salin dan sesuaikan `lib/formats/format-packs.ts` dari content-studio menjadi struktur cerita per format: `how_it_works`, `how_its_made`, `technical`, `what_if`, `today_in_history`.
- Masukan ke LLM: konsep terpilih, struktur format, dan **hanya klaim `verified`** dari ledger. 1 panggilan.

## 4. S4 QC Naskah
### 4.1 L2 (kode) — `src/core/qc/l2-script.ts`
- Setiap angka, tahun, dan satuan di kalimat harus cocok dengan `value`/`unit` atau teks klaim yang dirujuk (sadar format angka `id-ID`). Tidak cocok → error `NUMBER_NOT_IN_CLAIM`.
- Kalimat yang berisi angka/tahun tapi tanpa `claim_refs` → error `UNSOURCED_FACT`.
- `claim_refs` ke klaim yang tidak ada atau `unverified` → error `BAD_CLAIM_REF`.
- Kalimat `non_factual` yang berisi angka/tahun → error `NON_FACTUAL_HAS_FACT`.
- Nama diri (kata berhuruf kapital di tengah kalimat) yang tidak muncul di klaim yang dirujuk → warning `NAME_NOT_IN_CLAIM`.

### 4.2 L3 verifier (LLM) — `src/core/qc/l3-verifier.ts`
- Panggilan LLM terpisah dengan prompt adversarial: untuk setiap kalimat, bandingkan dengan **kutipan asli** klaim yang dirujuk, lalu nilai `supported | overstated | unsupported` beserta alasan. Cari juga generalisasi berlebihan dan sebab-akibat yang tidak ada di sumber.
- Keluaran masuk ke `QcReport` layer `L3`.

### 4.3 Perbaikan otomatis
- Kalau ada error L2 atau temuan `unsupported`/`overstated` dari L3: kirim naskah + daftar isu ke scriptwriter untuk ditulis ulang (**maksimal 1 kali**), lalu jalankan L2 dan L3 lagi.
- Isu yang tersisa tetap dilaporkan; jangan disembunyikan.

## 5. Gerbang 1 via CLI
- `mgs ideate <id>`, `mgs research <id> [--concept N]`, `mgs script <id>`, `mgs qc <id>`.
- `mgs run <id> --until gate1`: menjalankan S1–S4 berurutan (konsep pertama yang lolos L0 dipilih otomatis).
- `mgs review <id>`: mencetak naskah per kalimat, dengan klaim rujukan, kutipan asli, link sumber, dan isu QC (error ditandai jelas).
- `mgs approve <id>`: menandai Gerbang 1 lolos, **ditolak** kalau masih ada error L1/L2.
- Pemilik bisa mengedit `script.json` manual, lalu `mgs qc <id>` untuk memeriksa ulang.
- Status tahap dan jumlah panggilan LLM tercatat di `project.json`.

## 6. Test wajib (perilaku, bukan keberadaan kode)
**Unit test dengan fixture (tanpa jaringan):**
- L1 menolak `quote` yang diparafrasekan (tidak ada apa adanya di sumber) dan menerima `quote` yang beda spasi/tanda kutip saja.
- L1 menolak `value` yang tidak ada di `quote`; menerima `1,435` (sumber en) vs `1435`.
- L2 menangkap: angka karangan (naskah menulis 1.500 mm padahal klaim 1.435 mm), kalimat berangka tanpa `claim_refs`, rujukan ke klaim `unverified`, kalimat `non_factual` berisi tahun.
- L0 menandai konsep yang core claim-nya tidak didukung.

**Uji mutasi L3 (LLM sungguhan, minimal 1 kali):** ambil naskah yang sudah lolos, sisipkan satu kesalahan yang disengaja (misalnya ubah sebab-akibat atau besarkan angka di teks tanpa mengubah klaim), lalu buktikan L2 dan/atau L3 menangkapnya. Simpan naskah termutasi dan laporan QC-nya sebagai bukti.

## 7. Uji end-to-end (LLM sungguhan)
Jalankan `mgs run <id> --until gate1` untuk 3 topik:
1. "Kenapa kereta tidak tergelincir?" (`how_it_works`)
2. "Bagaimana mesin 4 tak bekerja?" (`technical`)
3. Today in history tanggal `07-20` (`today_in_history`)

Opsional kalau kuota cukup: "Bagaimana jika Bumi berhenti berputar?" (`what_if`).
Gunakan timeout klien yang cukup (lihat `AG-RULES.md` bagian 6).

## Bukti (`out/review/p2/`)
- Per topik, folder berisi `fact-ledger.json`, `script.json`, `qc/` (L0–L3), dan `review.txt` (keluaran `mgs review`, **disimpan sebagai UTF-8**).
- `stats.md`: per topik, jumlah panggilan LLM, jumlah klaim `verified`/`unverified` beserta alasannya, error L2 sebelum dan sesudah perbaikan, temuan L3, dan status Gerbang 1.
- `mutation-test/`: naskah termutasi + laporan QC yang menangkapnya.
- `verify.txt` (UTF-8).

## Kriteria lolos
1. Tindak lanjut P1 selesai dan P1 sudah di-merge ke `main` (`p1-done`).
2. `npm run verify` lulus, termasuk semua test bagian 6.
3. Minimal 3 topik menghasilkan naskah dengan **0 error L1/L2** setelah maksimal 1 kali perbaikan, dan semua kalimat faktual punya `claim_refs` ke klaim `verified`.
4. Uji mutasi membuktikan kesalahan yang disisipkan tertangkap.
5. Rata-rata panggilan LLM per topik sampai Gerbang 1 ≤ 7.
6. Semua bukti berformat UTF-8 dan bisa dibaca.

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch `phase/p2-facts-script`, lalu **berhenti**. Jangan merge P2 ke `main`.
