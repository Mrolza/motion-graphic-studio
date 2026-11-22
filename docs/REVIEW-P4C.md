# Review P4B Bagian C Video Final — oleh Claude (advisor)

> Tanggal: 22 November 2026 · Branch: `phase/p4-audio-final` · Status AG: **DONE** · Status review: **Mesin layak tayang (catatan kecil). Kereta belum layak tayang.** Pipeline boleh di-merge dengan tindak lanjut wajib di P4D.

## Hasil cek independen (saya ukur ulang langsung dari `final.mp4`)
| | Kereta (Standar) | Mesin (Hemat/swangle) |
|---|---|---|
| Video | 720×1280, 30 fps, 1042 frame tepat, 34,73 dtk | 720×1280, 30 fps, 1025 frame tepat, 34,17 dtk |
| Loudness | −14,3 LUFS, true peak −2,7 dBTP | −14,3 LUFS, true peak −2,6 dBTP |
| Hening ≥ 0,4 dtk (−45 dB) | 0 (jeda terpanjang ±0,37 dtk) | 0 (±0,33 dtk) |
| Frame hitam | 0 | 0 |

Hal lain yang beres:
- **Mesin bisa dirender tanpa GPU** dalam 208 detik.
- **Mutasi 1–16 tertangkap**, termasuk 8–11 pada MP4 sungguhan.
- **Kuota aman.** Fase ini memakai 31 panggilan (kereta 11 dalam 6 run, mesin 20 dalam 3 run), maksimal 8 per run. Kuota tidak habis lagi (sebelumnya 157 panggilan untuk satu video).
- **Video mesin:**
  - label langkah sinkron dengan sudut engkol (289° kompresi, 451° tenaga, 629° buang);
  - takarir sinkron;
  - "Kontinu" sudah hilang.

## Temuan kritis (kereta)

**1. Narasi masih melebih-lebihkan sumber, dan bertentangan dengan HUD di layar yang sama**
- Narasi dan takarir berbunyi "mengikuti tikungan **tanpa** flens bergesekan", padahal sumbernya "**less chance**". Pada detik 12, takarir menulis "tanpa" sementara callout menulis "peluang lebih kecil".
- Narasi "inersia kendaraan membuat roda **terus** melaju lurus" menghilangkan kata "**tend to**".
- Deskripsi di `publish.md` ikut mewarisi kalimat "tanpa".
- **Akar masalah:** teks klaim di **ledger** (parafrase bahasa Indonesia C1 dan C2) sudah kehilangan kata lunak, lalu naskah mengikuti ledger. L1 tidak membandingkan parafrase klaim dengan kutipannya. Verifier L3 di Gerbang 1 sepertinya membandingkan naskah dengan parafrase, bukan dengan kutipan.
- Pola yang lebih ringan ada di mesin: C8 menambahkan "meningkatkan suhu dan tekanan sebelum percikan busi", padahal kutipannya hanya menyebut kompresi isentropik. Faktanya benar, tetapi tidak ada di kutipan.

**2. Takarir menutupi HUD, tetapi QC final tetap PASS**
- Pada detik ±7, 12, 17, dan 22, kotak takarir menutupi baris kedua callout dan panel "Geser Lateral".
- Callout 2–3 baris tumbuh ke bawah masuk ke zona takarir. Pemeriksaan `CAPTION_HUD_OVERLAP` tidak berjalan pada bbox hasil render video final.

**3. Storyboard kereta yang lama dipakai ulang**
- File `storyboard.json` masih bertanggal 20 November, jadi:
  - S4 masih memakai batang tunggal "Diameter Efektif", bukan `EffectiveDiameterCompare`;
  - callout S3 berisi 13 kata (seharusnya error `HUD_TOO_LONG`), tetapi lolos.
- **Akar masalah:** hash cache tidak berubah walau kit dan aturan QC berubah, dan QC final tidak menjalankan ulang pemeriksaan kode pada artefak yang dipakai ulang.

## Temuan lain
- **`stats.md` menyesatkan.** Kolomnya menulis "0 / 20 run ini" untuk kereta, padahal ada 11 panggilan dalam 6 run di fase ini, dan waktu render ditulis 0 ms. Laporkan total per fase dari `llm-calls.jsonl`.
- **Verifier semantik mesin terpanggil 5 kali per run.** Seharusnya 1 kali per versi storyboard.
- **Kutipan HUD mesin belum lengkap.** Callout "Langkah Hisap & Kompresi" hanya merujuk C2, dan "Langkah Tenaga & Buang" hanya merujuk C9. Teks yang mencakup dua langkah harus merujuk kedua klaimnya.
- **`pix_fmt` masih `yuvj420p`** (rentang penuh). Pakai `yuv420p` demi kompatibilitas platform.
- **Teks ganda di S5 kereta.** Judul S5 ("Mekanisme fisika ini membantu…") tampil bersamaan dengan takarir yang isinya sama, sehingga teksnya terbaca dua kali.
- **Catatan untuk nanti, bukan penghalang:** suara memakai Microsoft Edge TTS (`id-ID-ArdiNeural`). Status izinnya untuk konten yang dimonetisasi tidak jelas. Ini perlu diputuskan sebelum unggah rutin (P7).

## Keputusan
1. Merge `phase/p4-audio-final` ke `main` (`--no-ff`, tag `p4-done`). Fitur pipeline lengkap dan terbukti; masalah yang tersisa adalah celah pemeriksaan.
2. **Video kereta tidak boleh diunggah** sebelum P4D selesai.
3. **Video mesin boleh diunggah sebagai uji coba (unlisted).** Belum ada kesalahan fakta di layar maupun narasi, hanya disiplin kutipan.
4. Lanjut ke `docs/P4D-TRUTH-SYNC.md`.
