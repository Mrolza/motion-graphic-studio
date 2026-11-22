# Review P3B Storyboard & Scene Coder — oleh Claude (advisor)

> Tanggal: 20 November 2026 · Branch: `phase/p3b-storyboard-coder` · Status review: **PARTIAL** (AG melaporkan selesai)

## Tonggak yang tercapai
- **Pipeline otomatis penuh berjalan:** naskah APPROVED → suara + timing kata → storyboard Gemini → kode adegan Gemini → QC visual → video + VO. Kedua video berdurasi sama dengan VO (38,7 detik dan 37,6 detik).
- Perbaikan P3A2 masuk: roda kini padat dengan **tapak kerucut yang terlihat**, flens di sisi dalam, menapak di rel. P3A sudah di-merge (`p3a-done`).
- TTS membaca "1 banding 20" dengan benar. Hampir semua adegan lolos QC visual tanpa perbaikan; LLM 10–13 panggilan per video.
- Mekanika mesin tetap benar di adegan buatan Gemini (warna ruang bakar dan sudut engkol sesuai langkah).

## Masalah 1 (kritis): teks di layar yang tidak bersumber dan salah
Scene Coder **menambahkan HUD sendiri** yang tidak ada di storyboard dan tidak diperiksa:
- **"Lebar Spoor 1.435 m"**: dalam format Indonesia, "1.435 m" berarti **seribu empat ratus tiga puluh lima meter**. Lebar sepur standar 1.435 **mm**. Angka ini juga **tidak ada di ledger** naskah kereta, dan "Spoor" adalah istilah Belanda.
- **"Kontak Flensa — Mencegah anjlok tanpa mekanisme kemudi"**: klaim tanpa sumber.
- **"Jarak Tempuh 5,0 m"**: angka tanpa makna yang terus muncul.

Storyboard sendiri bersih (HUD-nya merujuk C1–C3), dan QC storyboard 0 error. Tapi pemeriksaan **L5 dari PRD ("semua teks di layar cocok dengan ledger")** belum diterapkan pada hasil render. Ini melanggar prinsip inti produk.

## Masalah 2: gerbang storyboard tidak memblokir
Storyboard mesin masih punya 4 error `SB_HUD_NUMBER_NOT_IN_CLAIM`, tapi pipeline tetap lanjut ke Scene Coder. Error itu sendiri **positif palsu**: ekstraksi teks menggabungkan semua props (termasuk nama palet "blueprint-navy"), dan counter yang terikat ke penggerak ikut diperiksa terhadap klaim.

## Masalah 3: teks yang tidak sesuai fase dan format
- Callout "Siklus Daya — Tekanan tinggi mendorong piston" tetap tampil selama langkah buang (sekitar 605°–671°).
- Satuan sudut tampil "524 deg" alih-alih "524°" (regresi dari perbaikan P3A2).

## Masalah 4: monoton
Selama ±38 detik, video kereta hanya menampilkan **satu wheelset** dari sudut yang sedikit berbeda; video mesin hanya **satu piston**. Video referensi memakai variasi shot: kereta dari luar, close-up roda, penampang rel, diagram. Storyboard belum merencanakan jenis shot sama sekali.

## Masalah 5: bukti mutasi sync
Bukti mutasi 5 (`sync`) hanya berupa laporan error tanpa telemetri render. Mutasi harus dibuktikan dengan render sungguhan, seperti mutasi P3A.

## Keputusan
P3B belum di-merge. Perbaikan di `docs/P3C-ONSCREEN-TRUTH.md`, branch yang sama.
