# PRD — Motion-Graphic Studio

> Versi 1.0 · 18 November 2026 · Pemilik: Riyan · Advisor/reviewer: Claude · Eksekutor: Antigravity (AG)
> Dokumen ini adalah sumber kebenaran produk. AG **tidak boleh mengubah file ini**. Usulan perubahan ditulis di `docs/DECISIONS.md` dan menunggu persetujuan pemilik.

---

## 1. Ringkasan

Motion-Graphic Studio adalah web app lokal yang membuat video pendek vertikal (9:16, 30–60 detik) bergaya **motion graphic explainer**: low-poly 3D, isometrik 2.5D, peta animasi, dan kinetic typography. **Visualnya dibangun dari kode** (Remotion + Three.js), bukan slideshow gambar AI. Fokus utamanya adalah **kualitas konten dan akurasi fakta**: setiap angka, tanggal, nama, dan klaim di video harus bisa dilacak ke sumbernya.

**Standar minimal:** setara video referensi "Kenapa Kereta Tidak Tergelincir?". Satu dunia visual yang konsisten, kamera yang bergerak di dalam adegan, objek yang benar-benar beranimasi, dan HUD/teks yang sinkron dengan narasi.

**Topik target:** teknikal/otomotif, how things work, how it's made, today in history, what if.

---

## 2. Pelajaran dari content-studio (wajib dipatuhi)

| Masalah di content-studio | Aturan di Motion-Graphic Studio |
|---|---|
| Visual gambar AI + gerak kamera tetap terasa slideshow | Visual utama dibangun dari kode; gambar API hanya lapisan pelengkap |
| `page.tsx` 166 KB dan `executor.ts` 141 KB, satu file berisi semuanya | Batas ±400 baris per file; pipeline berupa modul kecil per tahap |
| Test hijau tapi UI rusak (test tidak menyentuh UI) | Smoke test end-to-end (Playwright) wajib untuk setiap fase yang menyentuh UI |
| Satu spec raksasa (9 fase) dalam satu run otonom | Satu fase per run, berhenti di checkpoint, direview sebelum lanjut |
| Fase ditulis DONE padahal ada bagian NOT TESTED | DONE hanya jika semua kriteria teruji; selain itu PARTIAL |
| Kesimpulan diambil dari timeout alat uji (60 detik) | Langkah panjang diuji dengan polling atau timeout panjang; timeout klien bukan bukti kegagalan |
| Kanvas n8n rumit padahal alur selalu berurutan | Alur lurus (wizard) dengan preview langsung |

---

## 3. Gaya visual (Style Packs)

Semua gaya **tersedia di semua profil perangkat** (lihat bagian 8). Profil hanya mengubah kecepatan dan kualitas render, bukan pilihan gaya.

### 3.1 Gaya inti (fase awal)
1. **Blueprint 3D**: low-poly 3D (Three.js via `@remotion/three`), palet gelap + aksen neon, HUD bergaya teknik, exploded view, cutaway/x-ray. Untuk otomotif, how things work, what if.
2. **Isometrik 2.5D**: SVG isometrik untuk jalur produksi, pabrik, kota. Untuk how it's made. Jalan sangat ringan di CPU.
3. **Peta & Arsip**: peta SVG animasi (rute, perbatasan, label tahun) + foto arsip Commons dengan parallax. Untuk today in history.

### 3.2 Lapisan bersama
- **Kinetic typography**: teks yang beranimasi mengikuti timing kata dari TTS.
- **HUD components**: counter angka, garis ukur, callout, grafik gelombang, daftar, panel perbandingan.

### 3.3 Variasi palet per gaya
Setiap gaya punya token desain (warna, font OFL, ketebalan garis, gaya transisi) yang bisa ditukar, misalnya Blueprint "biru teknik", "oranye industri", "gelap misterius".

### 3.4 Di luar cakupan awal
Karakter kartun beraksi, CGI realistis (gaya Zack D. Films), dan visual organik realistis yang dibuat dari kode.

---

## 4. Dua jalur visual

| Jalur | Isi | Kapan dipakai |
|---|---|---|
| **Kode** (utama) | Adegan 2D/2.5D (SVG) dan 3D (Three.js) yang ditulis sebagai komponen React memakai **Scene Kit** | Default untuk semua subjek mekanis, geometris, diagram, peta, data |
| **Aset API** (pelengkap) | Gambar dari generator (Cloudflare, FastSD lokal), arsip Wikimedia Commons, stock Pixabay; klip video dari Flow (manual) atau API berbayar (nanti) | Hanya untuk subjek yang tidak bisa dibuat dari kode: manusia, hewan, wajah tokoh, foto kejadian nyata, benda organik realistis |

**Aturan:** aset API tidak pernah tampil sebagai slide penuh. Aset selalu menjadi lapisan di dalam adegan kode: bingkai foto di atas peta, cutout di atas latar 2.5D, atau tekstur di bidang 3D, dengan gerak, parallax, dan HUD di sekitarnya.

**Larangan tetap:** wajah tokoh nyata dan foto kejadian nyata tidak pernah digenerate AI. Pakai arsip berlisensi bebas atau visual tanpa wajah.

---

## 5. Pipeline

Inti mesin adalah library TypeScript (`packages/core` atau `src/core`) yang **tidak bergantung pada UI**. Web app, CLI, dan antrean semuanya memanggil inti yang sama.

```
S1 Ide → S2 Riset & Fact Ledger → S3 Naskah → S4 QC Fakta Naskah
   → [Gerbang 1: review naskah + fakta]
   → S5 Suara (TTS) & Timeline → S6 Storyboard → S7 QC Storyboard
   → S8 Scene Code → S9 Validasi Adegan
   → [Gerbang 2: preview di browser]
   → S10 Render (per profil, per bagian) → S11 Audio mix & mux → S12 QC Final
```

| Tahap | Masukan → Keluaran | Catatan |
|---|---|---|
| S1 Ide | topik, format, gaya → 3 konsep + **klaim inti** tiap konsep | Konsep yang klaim intinya tidak bisa diverifikasi ditolak |
| S2 Riset | konsep terpilih → `fact-ledger.json` | Lihat bagian 6 |
| S3 Naskah | ledger + format → `script.json` | Setiap kalimat faktual membawa `claim_refs` |
| S4 QC Naskah | script + ledger → laporan isu | Cek kode + verifier LLM terpisah |
| S5 TTS & Timeline | naskah final → audio + timing kata + `timeline.json` | Modul dari content-studio |
| S6 Storyboard | script + timeline + gaya → `storyboard.json` | Per adegan: jalur, entitas, kamera, preset gerak, HUD (dengan `claim_ref`), kata pemicu |
| S7 QC Storyboard | storyboard + ledger → laporan isu | Fakta visual dan data HUD harus punya sumber |
| S8 Scene Code | satu adegan storyboard → satu file `.tsx` | Gemini menulis kode memakai Scene Kit saja |
| S9 Validasi | file adegan → lolos / perbaiki | Whitelist import, typecheck, render still, deteksi layar kosong, maks 2 kali perbaikan |
| S10 Render | semua adegan → video tanpa audio | Profil perangkat, render per bagian lalu digabung |
| S11 Audio | VO + SFX + BGM → mp4 final | Modul dari content-studio (−14 LUFS) |
| S12 QC Final | mp4 + render job + ledger → laporan | Metrik teknis + semua teks di layar cocok dengan ledger |

### 5.1 Penyimpanan
Tanpa database. Setiap proyek adalah folder `projects/<id>/` berisi `project.json`, `fact-ledger.json`, `script.json`, `timeline.json`, `storyboard.json`, `scenes/*.tsx`, `assets/`, `out/`, dan `qc/`. Mudah dibaca, di-diff, dan di-backup.

### 5.2 Anggaran panggilan Gemini (target)
Per video kira-kira: S1 (1), S2 ekstraksi (1), S3 (1), S4 verifier (1), S6 (1), S7 verifier (1), S8 (1 per adegan, 5–8 adegan), S9 perbaikan (rata-rata ≤ 2). **Target ≤ 15 panggilan per video** pada model free tier yang dipakai. Jumlah panggilan aktual dicatat di setiap proyek.

---

## 6. Sistem akurasi fakta (dibangun sejak fase awal)

Prinsip: **narasi dan visual hanya boleh memakai fakta yang ada di Fact Ledger, dan setiap fakta di ledger harus punya kutipan asli dari sumber.**

### 6.1 Fact Ledger
```jsonc
{
  "claims": [{
    "id": "C1",
    "text": "Lebar standar rel kereta adalah 1.435 mm",
    "value": 1435, "unit": "mm",                       // opsional, untuk angka
    "kind": "fact | estimate | hypothetical | interpretation",
    "status": "verified | unverified | disputed",
    "sources": [{ "url": "...", "title": "...", "quote": "kutipan asli dari sumber", "retrieved_at": "ISO" }]
  }]
}
```

### 6.2 Sumber (gratis dulu)
1. **Wikipedia REST API** (ringkasan dan isi halaman) dan pencarian Wikipedia: tanpa API key.
2. **Wikidata**: untuk angka dan tanggal terstruktur.
3. **Wikimedia On This Day**: untuk today in history (modul dari content-studio).
4. **Opsional:** Gemini grounding dengan Google Search, hanya kalau tersedia di API key pemilik (di free tier Gemini 3 tidak tersedia). Aplikasi mengecek ketersediaannya, bukan mengasumsikan.

### 6.3 Lapisan pemeriksaan
| Lapisan | Pemeriksaan | Cara |
|---|---|---|
| L0 Ide | Klaim inti konsep bisa diverifikasi; mitos populer ditolak | Konsep wajib menyebut klaim inti; riset awal cepat |
| L1 Ledger | **Setiap `quote` harus muncul apa adanya di teks sumber yang diambil** | Pencocokan string di kode, bukan penilaian LLM |
| L2 Naskah | Angka, tanggal, nama, dan satuan di narasi harus ada di klaim yang dirujuk; kalimat faktual tanpa `claim_refs` ditolak | Cek kode |
| L3 Verifier | Klaim berlebihan, generalisasi, sebab-akibat yang tidak didukung sumber | Panggilan LLM terpisah dengan prompt adversarial |
| L4 Storyboard | Setiap angka HUD, label, dan fakta visual (misalnya "flens ada di sisi dalam roda") punya `claim_ref` | Cek kode + verifier |
| L5 Final | Semua teks di layar (diambil dari props render job, bukan OCR) cocok dengan ledger | Cek kode |
| Manusia | Gerbang 1 menampilkan setiap klaim beserta kutipan dan link sumber; isu ditandai merah | UI |

### 6.4 Aturan per format
- **today_in_history:** hanya fakta dari Wikimedia/Wikipedia; tanggal dan nama wajib sama persis dengan sumber.
- **what_if:** skenario boleh hipotetis, tapi setiap akibat berpijak pada klaim `fact` atau `estimate` yang bersumber; narasi hipotetis memakai bahasa pengandaian.
- **teknikal / how things work / how it's made:** angka teknis (dimensi, kecepatan, tekanan, suhu) wajib dari ledger; penjelasan mekanisme yang tidak ada di sumber ditandai `interpretation` dan ditinjau di Gerbang 1.

---

## 7. Scene Kit (kunci keandalan)

Gemini tidak menulis Three.js atau SVG bebas. Gemini menulis komposisi adegan **hanya** memakai Scene Kit, yaitu pustaka komponen yang kita bangun dan uji sendiri:

- **Primitif 3D:** Box, Cylinder, Gear, Wheel, Rail, Beam, Pipe, Spring, Arrow3D, Label3D, Ground, Grid.
- **Material dan cahaya:** diambil dari token gaya (tidak ada warna bebas).
- **Rig kamera:** orbit, dolly, fly-through, close-up, top-down; dengan easing.
- **Preset gerak:** rotate, spin, translate-path, explode/assemble, bounce, oscillate (pegas), reveal, highlight/pulse.
- **2D/2.5D:** blok isometrik, konveyor, pipa, peta SVG (data Natural Earth, domain publik), rute, penanda.
- **HUD:** StatCounter, DimensionLine, Callout, Waveform, ListReveal, CompareCard, DateStamp, Timeline, KineticText.
- **Sinkron waktu:** semua animasi menerima `startWord`/`startSec` dari timeline.

**Aturan keamanan dan determinisme kode adegan (dicek otomatis di S9):**
- Import hanya dari Scene Kit, `react`, dan `remotion`.
- Dilarang: `fetch`, `eval`, `Function`, dynamic `import()`, akses `window`/`document`/`localStorage`, `Math.random`, `Date.now`. Untuk acak, pakai `random()` dari Remotion.
- Satu file per adegan, maksimal ±200 baris.

---

## 8. Profil perangkat dan akselerasi hardware

Deteksi otomatis lewat benchmark singkat saat pertama dijalankan; bisa diubah manual di pengaturan.

| Profil | Contoh | Mesin WebGL | Pengaturan render |
|---|---|---|---|
| **Hemat** | Laptop tanpa GPU | `swangle` (software) | 720p, tanpa bayangan, AA rendah, concurrency 1 |
| **Standar** | Intel Core Ultra 7 256V (iGPU Arc) | `angle` | 720p, bayangan sederhana, concurrency sesuai benchmark |
| **Penuh** | Laptop RTX 5060/5070 | `angle` (GPU) | 1080p, bayangan dan AA penuh, render paralel |

**Akselerasi tambahan bila tersedia:**
- **NPU Intel:** FastSD (OpenVINO) untuk gambar lokal di jalur aset; kandidat untuk model kecil lain (hapus latar, estimasi kedalaman) bila didukung OpenVINO.
- **GPU NVIDIA:** FastSD/model gambar lokal di CUDA; encoding video NVENC.
- **iGPU Intel:** encoding Quick Sync (QSV) untuk langkah FFmpeg yang perlu encode ulang.
- Semua akselerasi bersifat "pakai kalau ada, jatuh ke CPU kalau tidak", dan pilihannya dicatat di laporan render.

**Render per bagian:** video dirender per kelompok adegan lalu digabung, untuk menghindari kebocoran memori pada render WebGL panjang dan supaya kegagalan tidak mengulang seluruh video.

---

## 9. Antarmuka

Web app lokal (Next.js) dengan alur lurus, bukan kanvas:

1. **Mulai:** topik, format, gaya, palet, durasi target.
2. **Ide:** 3 konsep beserta klaim intinya; pilih satu.
3. **Naskah & Fakta (Gerbang 1):** naskah bisa diedit; panel fakta menampilkan setiap klaim, kutipan, dan link sumber; isu QC ditandai.
4. **Storyboard & Preview (Gerbang 2):** daftar adegan + **Remotion Player** untuk preview langsung di browser tanpa render; bisa minta ulang satu adegan.
5. **Render & Hasil:** progres render, video final, laporan QC, file unduhan.
6. **Pengaturan:** profil perangkat, provider, kuota, palet.

Setiap layar adalah komponen terpisah (bukan satu file raksasa).

---

## 10. Otomasi

- **Satu klik:** dari topik sampai video, dengan gerbang review yang bisa dinyalakan/dimatikan.
- **CLI:** `npm run make -- --topic "..." --format how_it_works --style blueprint`.
- **Antrean batch:** beberapa topik diproses berurutan (cocok untuk render semalaman).
- **Terjadwal (fase lanjutan):** misalnya draf today in history setiap pagi, menunggu review.
- **Di luar cakupan:** upload otomatis ke YouTube/TikTok.

---

## 11. Teknologi

- Next.js (App Router) + TypeScript (strict), Tailwind.
- Remotion (versi stabil terbaru yang terbukti jalan di laptop pemilik; 4.0.536 sudah terbukti di content-studio) + `@remotion/three` + `three` + `@react-three/fiber`.
- `@google/genai` untuk Gemini; model default dari env, dengan probe kuota.
- `msedge-tts` (timing kata), FFmpeg untuk audio.
- Vitest (unit), Playwright (smoke e2e).
- Lisensi: Remotion gratis untuk individu dan perusahaan ≤ 3 orang; font OFL; data peta domain publik; aset Commons hanya lisensi bebas dengan credit.

---

## 12. Modul yang diambil dari content-studio

| Modul | Cara |
|---|---|
| `lib/media/tts.ts`, `timeline.ts`, `audio-mix.ts`, `lib/render/captions.ts`, `lib/media/quota.ts`, `cache.ts`, `lib/research/wikimedia.ts`, `commons.ts`, font OFL, SFX, beserta test-nya | Salin, sesuaikan import, test harus tetap lulus |
| `lib/media/providers.ts` (jalur aset API), `lib/render/render-job.ts`, `remotion-runner.ts`, `lib/engine/script-v2.ts` (validator), `format-packs.ts`, `theme-packs.ts`, prompt Scriptwriter v2.2 | Salin lalu refactor sesuai kontrak baru |
| `lib/engine/executor.ts` | Hanya ambil logika retry, timeout, dan penanganan kuota Gemini; ditulis ulang sebagai modul kecil |
| `app/page.tsx`, Supabase | Tidak dipakai |

Pemilik menyalin `.env.local` sendiri. AG tidak membaca isinya.

---

## 13. Kriteria kualitas video

**Teknis:** 1080×1920 (profil Penuh) atau 720×1280; 30 fps; loudness −14 ± 1 LUFS; tidak ada hening > 0,4 detik; tidak ada frame hitam/kosong.

**Visual:** setiap adegan punya gerak objek atau kamera yang bermakna; teks HUD terbaca di area aman; konsistensi gaya antaradegan; tidak ada adegan yang hanya gambar diam.

**Fakta:** 0 isu L1/L2/L5 yang tersisa; semua isu L3/L4 diselesaikan atau disetujui pemilik di Gerbang 1.

**Proses:** waktu render dan jumlah panggilan Gemini dicatat per video.

---

## 14. Roadmap

| Fase | Isi | Selesai jika |
|---|---|---|
| **P0 Spike** | Bukti low-poly 3D + Scene Kit mini + Gemini menulis adegan | Lihat `docs/SPIKE-1.md` |
| P1 Fondasi | Repo, struktur folder, salin modul content-studio, kontrak data, CLI kosong | Test modul salinan lulus, CLI jalan |
| P2 Fakta & Naskah | S1–S4, Fact Ledger, L0–L3, Gerbang 1 versi CLI | 3 topik uji menghasilkan naskah tanpa isu L1/L2 |
| P3 Scene Kit & Storyboard | Scene Kit lengkap gaya Blueprint, S6–S9 | 1 video Blueprint lengkap tanpa audio |
| P4 Audio & Render | S5, S10–S12, profil perangkat | 1 video final lolos semua kriteria bagian 13 |
| P5 UI | Wizard + Remotion Player + panel fakta | Smoke test Playwright lulus |
| P6 Gaya tambahan | Isometrik 2.5D, Peta & Arsip | 1 video per gaya |
| P7 Otomasi | Antrean batch, jadwal | 3 topik diproses tanpa intervensi |

Setiap fase dikerjakan di branch sendiri dan direview sebelum digabung.

---

## 15. Risiko dan pertanyaan terbuka

- **Kualitas kode adegan dari Gemini** belum terbukti → diuji di P0.
- **Kecepatan WebGL** di profil Hemat/Standar → diukur di P0.
- **Kuota free tier Gemini** untuk ±15 panggilan per video → dicatat sejak P0.
- **Topik teknis yang sumbernya tipis di Wikipedia** → status `unverified` muncul di Gerbang 1 dan pemilik memutuskan.
