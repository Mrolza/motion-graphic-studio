# Decisions — Motion-Graphic Studio

Catatan keputusan teknis kecil yang diambil selama implementasi per fase dan usulan perubahan PRD (jika ada).

## P0 — Spike
1. **Versi Remotion & React:** Memakai Remotion `4.0.545` (terbaru) dengan `react` `19.2.0` dan `@react-three/fiber` `9.8.2` karena kompatibel penuh dan berjalan lancar di Windows tanpa perlu fallback ke `4.0.536`.
2. **Encoding hardware Remotion di Windows:** Menggunakan `hardwareAcceleration: "disable"` pada `renderMedia()` karena `"if-possible"` menghasilkan `Error: write EOF` di Windows.
3. **Normalisasi Composition ID Remotion:** Mengganti `_` menjadi `-` pada ID komposisi Remotion (karena Remotion hanya mengizinkan `a-z, A-Z, 0-9, CJK, -`).

## P0b — Uji Generalisasi
1. **Eksekusi sinkron `CameraRig`:** Memindahkan pembaruan `camera.position` dan `camera.lookAt` agar dieksekusi sinkron di render body (+ `useLayoutEffect` sebagai cadangan) karena `useEffect` berjalan setelah `<ThreeCanvas>` menggambar frame.
2. **Retry transient API Gemini:** Menambahkan exponential backoff (maks 3 retry untuk error `503`/`429`) di `run-scene-coder-p0b.ts` karena `gemini-3.5-flash-lite` mengalami lonjakan trafik sementara.
