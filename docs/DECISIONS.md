# Decisions — Motion-Graphic Studio

Catatan keputusan teknis kecil yang diambil selama implementasi per fase dan usulan perubahan PRD (jika ada).

## P0 — Spike
1. **Versi Remotion & React:** Memakai Remotion `4.0.545` (terbaru) dengan `react` `19.2.0` dan `@react-three/fiber` `9.8.2` karena kompatibel penuh dan berjalan lancar di Windows tanpa perlu fallback ke `4.0.536`.
2. **Encoding hardware Remotion di Windows:** Menggunakan `hardwareAcceleration: "disable"` pada `renderMedia()` karena `"if-possible"` menghasilkan `Error: write EOF` di Windows.
3. **Normalisasi Composition ID Remotion:** Mengganti `_` menjadi `-` pada ID komposisi Remotion (karena Remotion hanya mengizinkan `a-z, A-Z, 0-9, CJK, -`).
