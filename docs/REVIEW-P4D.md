# Review P4D Narasi Setia Sumber & Layar Sinkron — oleh Claude (advisor)

> Tanggal: 22 November 2026 · Branch: `phase/p4d-truth-sync` · Status AG: **DONE** · Status review: **Mesin teknisnya lolos, tetapi ada regresi isi dan kesalahan visual. Belum ada video yang layak tayang. Boleh di-merge** dengan kalibrasi di P4E.

## Yang tercapai (saya cek ulang langsung)
- **Teknis kedua video lolos:** `yuv420p`, 720×1280, jumlah frame tepat. Kereta −14,3 LUFS / TP −2,7; mesin −14,5 LUFS / TP −3,0. Tidak ada hening ≥ 0,4 detik.
- **Takarir dan HUD tidak lagi bertumpuk.** Contact sheet saya bersih, cocok dengan `overlap-scan.md` (0 dari 219 dan 182 frame).
- **Kereta:** S3 memakai `EffectiveDiameterCompare`, semua callout ≤ 6 kata, dan "tanpa flens bergesekan" sudah hilang dari narasi, takarir, HUD, dan `publish.md`.
- **Mesin dan gerbang:** cek hedge L1, Gerbang 1 dengan kutipan asli (baris kode disebut), `QC_RULES_VERSION` + hash `KIT-API.md`, QC final menjalankan ulang pemeriksaan kode, mutasi 23/23 tertangkap.

## Temuan

**1. Narasi kereta masih membuang kata lunak**
- Kalimat S2 berbunyi "Tanpa bentuk kerucut tersebut, roda **akan melaju lurus**…", padahal klaim C9 berbunyi "akan **cenderung** melaju lurus" dan kutipannya "would **tend to** continue".
- Kriteria 3 hanya terpenuhi secara harfiah, karena frasa "terus melaju lurus" diganti "akan melaju lurus". Verifier Gerbang 1 tidak menangkapnya.
- Pemeriksaan kode hedge baru dijalankan pada ledger, belum pada kalimat naskah.

**2. Ledger terlalu ketat sehingga isi penting hilang (regresi)**
- **Mesin:** klaim kompresi (C3/C8) ditandai `unverified` karena berlebihan, sehingga **langkah kompresi tidak dijelaskan sama sekali**. Video "cara kerja mesin 4 tak" kini hanya menjelaskan 3 dari 4 langkah. Seharusnya C3 diparafrase ulang dari kutipannya ("piston compresses the air-fuel mixture in preparation for ignition… both valves are closed"), bukan dibuang.
- **Kereta:** C1 dan C7 sudah **setia** pada kutipan ("sebagian besar… sekitar 1 berbanding 20", "peluang lebih kecil"), tetapi tetap `unverified`. Ini *false positive*. Fakta 1:20 hilang dari video, dan ledger tidak mencatat alasannya.

**3. Kesalahan visual: panah bertentangan dengan label (mesin)**
Pada langkah tenaga (14,6–19,8 detik), piston bergerak **turun** dan label berbunyi "dorong piston **ke bawah**", tetapi panah kuning menunjuk **ke atas** sepanjang adegan. Belum ada QC yang memeriksa arah panah terhadap gerak.

**4. Salah ketik di judul pembuka kereta**
Judul berbunyi "Kenapa Kereta Tidak **Tegelincir**?", padahal seharusnya "Tergelincir". Verifier semantik menilai OK, karena belum ada pemeriksaan ejaan.

**5. Hitungan panggilan Gemini belum jujur**
- `stats.md` melaporkan total kumulatif file (67 dan 77), padahal yang diminta total per fase. Dari `llm-calls.jsonl`, P4D sendiri memakai **kereta 56 panggilan dalam 19 run** dan **mesin 57 panggilan dalam 8 run**.
- Panggilan S2–S4 (riset, naskah, Gerbang 1) **tidak tercatat**, padahal ledger dan naskah dibuat ulang. Total sebenarnya lebih besar.
- `storyboard_review` dipanggil di setiap run walau storyboard tidak berubah. Contohnya 6 run berturut-turut (pukul 09.06–09.28 WIB) yang masing-masing berisi 1 panggilan.
- Pola run ulang beruntun ini bertentangan dengan AG-RULES §6.

**6. Bukti "sebelum" salah label**
Bagian "Sebelum (P4)" di `ledger-diff.md` berisi 15 klaim yang sudah memakai kata lunak. Itu bukan ledger P4 (4 klaim, dengan C1 berbunyi "tanpa flens bergesekan"). Snapshot diambil setelah riset ulang.

**7. Kecil**
- Kalimat pembuka kereta "kereta yang berjalan di **rel lurus** mampu berbelok" janggal.
- HUD `EffectiveDiameterCompare` tercatat `display: value`, padahal tampilannya kualitatif. Metadatanya perlu disamakan.

## Keputusan
- Merge P4D ke `main` (tag `p4d-done`). Alat sinkronisasi layar, cache, dan pemeriksaan ulang sudah benar.
- **Video untuk uji unggah tetap mesin versi P4C** (`out/review/p4/p2-mesin4tak/final.mp4`), karena versi P4D kehilangan langkah kompresi.
- Lanjut ke `docs/P4E-TRUTH-CALIBRATION.md`: kalibrasi supaya gerbang tidak *false negative* (kata lunak di naskah lolos) dan tidak *false positive* (klaim setia dibuang), ditambah cek cakupan langkah, arah panah, dan ejaan.
