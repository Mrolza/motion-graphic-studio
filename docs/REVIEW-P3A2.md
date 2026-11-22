# Review P3A2 Visual Truth — oleh Claude (advisor)

> Tanggal: 20 November 2026 · Branch: `phase/p3a-scene-kit` · Status review: **LOLOS, siap merge** (dengan perbaikan kecil di langkah 0 P3B)

## Yang terbukti
- **Geometri kereta sudah benar:** dua roda menapak di dua rel berjarak sepur, gandar tegak lurus rel, flens (cakram kuning yang lebih besar) berada di sisi dalam.
- **Demo mesin sekarang jelas:** poros engkol dan batang terlihat dan tersambung; ruang bakar biru saat hisap, merah dengan nyala busi di 369°, keabuan saat buang; katup yang membuka terlihat. Posisi pena engkol konsisten dengan sudut (68° di kanan, 630° di kiri).
- QC visual kini punya 7 lapis (mechanics, geometry, visibility, framing, hudOverlap, hudFormat, blank). **10 mutasi** dirender ulang dan semuanya gagal dengan error yang tepat.
- Render cepat (15–16 detik video dalam ±14 detik), overhead telemetri kecil.

## Perbaikan kecil (dikerjakan di langkah 0 P3B)
1. **Tapak kerucut tidak terlihat.** Roda dimodelkan sebagai dua cakram tipis (flens dan muka roda) dengan celah di antaranya, sehingga permukaan tapak berbentuk kerucut, yang justru inti penjelasannya, tidak ada. Modelkan roda sebagai benda padat (lathe): tapak kerucut + flens, dengan `taperExaggeration` yang benar-benar terlihat.
2. **Perbedaan diameter efektif tidak terasa.** Lingkaran "roda dalam" dan "roda luar" di adegan C hampir sama besar. Perbedaannya harus terlihat jelas (dilebih-lebihkan dengan label yang sama), misalnya lingkaran berbeda warna dan ukuran di titik kontak masing-masing.
3. **Panah inersia tidak terbaca.** Di adegan B terlihat seperti bola di tongkat. Pakai `Arrow3D` yang menunjuk ke arah rel luar.
4. **ID klaim bocor ke layar.** "Inersia Kendaraan (C2)" dan "Gandar Kaku (C3)" menampilkan ID klaim ke penonton. `claim_ref` hanya untuk telemetri. Tambahkan pemeriksaan `hud-format`: teks layar tidak boleh mengandung pola ID klaim seperti `(C\d+)`.
5. **Subjek terlalu kecil.** Di demo mesin, mesin hanya mengisi sepertiga atas; ±40% bawah layar kosong. Tambahkan pemeriksaan `framing` (warning): area entitas fokus minimal ±20% dari zona bebas.
6. **Format derajat:** "68 °" seharusnya "68°" (tanpa spasi).
