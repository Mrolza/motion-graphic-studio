# Review P4E Kalibrasi Gerbang Fakta — oleh Claude (advisor)

> Tanggal: 22 November 2026 · Branch: `phase/p4e-truth-calibration` · Status AG: **DONE** · Status review: **Kereta LAYAK TAYANG (video pertama). Mesin TIDAK layak (visual salah topik). Boleh di-merge** dengan tindak lanjut di P4F.

## Kereta — lolos (saya cek ulang)
- **Teknis:** 34,53 dtk, 1036 frame, `yuv420p`, −14,2 LUFS, TP −2,9 dBTP; hening ≥ 0,4 dtk dan frame hitam keduanya 0.
- **Akurasi:** setiap kalimat narasi saya cocokkan dengan kutipannya.
  - "**Sebagian besar** … kemiringan **sekitar** 1 banding 20" (C1, sekarang `verified`);
  - "roda akan **cenderung** melaju lurus" (C2);
  - diameter efektif dan roda luar menempuh jarak sedikit lebih jauh (C3);
  - flensa sebagai tonjolan pengaman (C4/C5, id.wikipedia).
- **Layar:** judul tanpa salah ketik, "Kemiringan — 1:20" dengan badge 12×, panel "Roda dalam/Roda luar" kualitatif, dan tidak ada takarir yang menumpuk.
- **Panggilan Gemini:** 23 di fase ini, dalam 6 run, maksimal 12 per run.
- Catatan kecil, bukan penghalang: kalimat pembuka memakai bahasa santai ("mikir, gimana, gak, tetep"), sedangkan kalimat lain formal. Pilih satu gaya di preset format (P6).

## Mesin — visual salah topik
1. **Komponen kereta muncul di video mesin.**
   - **S3** (penjelasan langkah hisap dan kompresi, ±8–21 dtk) menampilkan **`RailCrossSection`**, yaitu penampang roda kereta dengan badge "Skala dilebihkan (12×)". Storyboard menulis `S3 cross_section ['rail_cross_section']`.
   - **S2 dan S4** memakai `DiagramOverlay curveArc inertiaArrow` (diagram inersia tikungan kereta). Garis lengkung putus-putus dan panah kuning yang **selalu menunjuk ke atas** walau piston naik-turun berasal dari sini. "Panah terbalik" di P4D juga berasal dari komponen ini.
   - **Akar masalah:** kit tidak punya penanda domain. Shot `cross_section` hanya punya komponen rel, aturan variasi shot mendorong Gemini memakainya, dan tidak ada QC yang mencocokkan entitas/komponen dengan topik.
2. **Cek panah memberi "YA" palsu.** Di `arrows.md`, S2 punya arah panah rata-rata −0,053 sementara piston naik +1,074, tetapi tetap ditulis "Cocok = YA". Rata-rata untuk gerak bolak-balik tidak bermakna. Cek itu juga hanya mengukur `MotionArrow`, bukan panah yang benar-benar terlihat.
3. **Cek cakupan dangkal.** Di `coverage.md`:
   - mesin: keempat langkah dipetakan ke kalimat ikhtisar yang **hanya menyebut nama** keempat langkah;
   - kereta: keempat langkah dipetakan ke kalimat 1:20.
   Pemeriksaan ini akan tetap lolos walau kalimat penjelasan kompresi dihapus. Narasi mesin sekarang memang menjelaskan keempat langkah, tetapi itu bukan karena cek ini bekerja.
4. **Teks HUD terpotong "…"**, misalnya "Hisap: Piston turun menarik campuran…" dan "Siklus 4 tak berlangsung dalam putaran…". Line clamp memotong kalimat di layar.
5. **Panggilan Gemini mesin 66 di fase ini** (target 40). Dilaporkan jujur, ini sudah membaik.

## Celah lain yang saya temukan dari log (22 Nov, 10.37)
- `scene-safety.ts` belum melarang `Math.random`, `Date.now`, `new Date(`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `useFrame`, dan `clock`, padahal PRD §7 mewajibkannya. Tanpa larangan ini, render per chunk bisa tidak konsisten.
- `tts.ts` diam-diam beralih ke Google Translate TTS jika msedge-tts gagal di satu adegan, sehingga suara dalam satu video bisa berbeda.
- Peringatan `THREE.Clock` membanjiri log, dan `DEP0190` muncul karena `npm.cmd` dipanggil dengan `shell: true` di `scene-coder.ts`.

## Keputusan
- Merge P4E ke `main` (tag `p4e-done`).
- **Video kereta P4E (`out/review/p4e/p2-kereta/final.mp4`) layak diunggah.**
- Video mesin dibuat ulang setelah `docs/P4F-DOMAIN-SAFETY.md`.
