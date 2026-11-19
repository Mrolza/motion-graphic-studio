# P2B — Relevansi, Kualitas Naskah, dan Ketahanan

> Fase: **P2B** · Lanjutkan di branch `phase/p2-facts-script` (jangan buat branch baru) · Baca `docs/AG-RULES.md` dan **`docs/REVIEW-P2.md`**.
> Tujuan: naskah tidak hanya akurat, tapi **menjawab pertanyaan topik dengan jelas dan menarik**. Lalu selesaikan uji 3 topik yang tertunda.

## 1. Riset yang tepat sasaran (`research.ts`, `wikipedia.ts`, `ideate.ts`)
- S1 menambahkan `wiki_titles` per konsep: judul artikel Wikipedia yang paling mungkin berisi jawaban (en dan id), misalnya untuk kereta: `Wheelset (rail transport)`, `Flange`, `Track gauge`, `Hunting oscillation`, `Derailment`.
- S2 mengambil artikel **berdasarkan judul** dulu (ikuti redirect), lalu pencarian bebas sebagai cadangan.
- Urutan bahasa per format: `how_it_works`, `how_its_made`, `technical`, `what_if` → **en dulu**, id sebagai pelengkap; `today_in_history` → seperti sekarang (On This Day, id lalu en).
- Saat ekstraksi klaim, LLM juga menilai relevansi setiap sumber terhadap pertanyaan topik (`relevant | partial | irrelevant`). Sumber `irrelevant` dibuang dan dicatat. Ini masuk ke panggilan ekstraksi yang sudah ada, bukan panggilan baru.

## 2. Logika L0 diperbaiki
- Kalau ada `core_claims` konsep yang tidak didukung klaim `verified`: lakukan **satu putaran riset tambahan** yang khusus mencari klaim yang hilang (judul/kueri baru dari LLM, maksimal 1 panggilan tambahan), lalu jalankan L1 dan L0 lagi.
- Baru setelah itu, konsep yang masih tidak didukung ditandai `concept_unverifiable`.
- **Dilarang** memilih konsep hanya karena cocok dengan sumber yang kebetulan terambil. Urutan konsep tetap dari S1; konsep berikutnya dicoba hanya kalau konsep sebelumnya gagal setelah riset tambahan.

## 3. QC baru: L0b Relevansi & Kualitas (`src/core/qc/l0b-quality.ts`)
Digabung ke panggilan verifier L3 (satu panggilan LLM, dua bagian keluaran) supaya tidak menambah panggilan. Pemeriksaan:
1. **Menjawab pertanyaan:** apakah naskah menjawab pertanyaan topik secara langsung, dan jawabannya muncul di ±10 detik pertama setelah hook?
2. **Cakupan:** apakah semua `core_claims` konsep terpilih tersampaikan?
3. **Struktur:** hook → penjelasan bertahap (sebab → akibat) → payoff/penutup. Hook harus dibayar oleh isi.
4. **Tidak menyimpang:** tidak ada bagian besar yang membahas hal lain dari topik.

Keluaran: `answers_question` (ya/tidak), skor 1–5 per poin, dan isu. `answers_question = tidak` atau skor < 3 → error dan memicu penulisan ulang (masuk ke jatah 1 kali penulisan ulang yang sudah ada). `mgs approve` ditolak kalau `answers_question = tidak`.

## 4. L3 diperketat
Tambahkan aturan eksplisit di prompt verifier: **generalisasi dari kasus spesifik ke kelas umum** (satu model, satu produk, satu kejadian → "semua kereta", "kereta api pada umumnya") dinilai `overstated`.

## 5. Durasi
Cek kode: jumlah kata naskah dibandingkan target durasi (±2,3 kata per detik untuk narasi bahasa Indonesia; 45 detik ≈ 95–115 kata). Di luar rentang ±20% → warning, dan dikirim ke penulisan ulang bersama isu lain.

## 6. Prompt scriptwriter dilengkapi (`src/core/prompts/scriptwriter.md`)
Pertahankan aturan fakta yang sudah ada, lalu tambahkan kembali dari `D:\content-studio\docs\SCRIPTWRITER-SYSTEM-PROMPT-v2.md` bagian yang relevan untuk naskah (bukan visual):
- aturan hook dan kewajiban hook dibayar;
- jawaban inti muncul cepat;
- rantai penjelasan sebab → akibat yang konkret;
- aturan bahasa yang ramah TTS (bagian 6 v2.2);
- struktur per format dari `format-packs.ts`.
Target ukuran prompt ±5–8 KB.

## 7. Ketahanan terhadap 503
- Backoff eksponensial dengan jitter, maksimal 6 percobaan (±2 → 60 detik), khusus untuk 503/UNAVAILABLE dan 429 per menit.
- Env opsional `GEMINI_FALLBACK_MODEL`: kalau model utama tetap 503 setelah semua percobaan, coba sekali dengan model cadangan. Kalau env kosong, berhenti dengan pesan jelas. Model yang dipakai dicatat per panggilan.
- **Bisa dilanjutkan:** `mgs run` melewati tahap yang sudah `done` dan memakai keluaran tersimpan, jadi kegagalan di S3 tidak mengulang S1–S2.

## 8. Uji mutasi yang halus
Tambahkan ke `out/review/p2/mutation-test/` minimal tiga mutasi halus pada naskah yang sudah lolos, dan buktikan masing-masing tertangkap (L2, L3, atau L0b):
1. **Angka yang mirip:** 1.435 mm → 1.453 mm.
2. **Generalisasi:** fakta tentang satu model/kejadian ditulis sebagai fakta umum.
3. **Sebab-akibat diubah:** misalnya "flens mencegah roda keluar rel" → "flens membuat kereta lebih cepat".
4. **Menyimpang dari topik:** satu adegan diganti dengan fakta benar tapi tidak relevan.

## 9. Uji ulang end-to-end
Hapus proyek uji lama, lalu jalankan `mgs run <id> --until gate1` untuk:
1. "Kenapa kereta tidak tergelincir?" (`how_it_works`)
2. "Bagaimana mesin 4 tak bekerja?" (`technical`)
3. Today in history `07-20` (`today_in_history`)

## Bukti (`out/review/p2/`, timpa yang lama)
- Per topik: `fact-ledger.json`, `script.json`, `qc/` (L0, L0b, L1, L2, L3), `review.txt`, dan **`sources.md`** (judul dan URL semua sumber yang dipakai, yang dibuang beserta alasannya).
- `stats.md`: per topik, panggilan LLM (dan model yang dipakai), klaim verified/unverified, hasil L0b, jumlah kata vs target, status Gerbang 1.
- `mutation-test/`: keempat mutasi halus dan laporan yang menangkapnya.
- `verify.txt` (UTF-8).

## Kriteria lolos
1. `npm run verify` lulus.
2. Ketiga topik selesai sampai Gerbang 1 dengan 0 error L1/L2 dan **`answers_question = ya`**.
3. Naskah kereta menjelaskan mekanisme yang benar-benar menjawab pertanyaan (didukung sumber), bukan sejarah satu kereta tertentu.
4. Keempat mutasi halus tertangkap.
5. Rata-rata panggilan LLM per topik ≤ 8.

Catat status DONE/PARTIAL di `docs/PROGRESS.md`, commit, push branch, lalu **berhenti**.
