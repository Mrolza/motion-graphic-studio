# Kualifikasi Ulang Kereta P4E dengan Aturan P4F

- **Video diuji:** `out/review/p4e/p2-kereta/final.mp4` (tidak dibuat ulang)
- **QC Teknis/Audio/Visual:** **PASS** (720x1280, 1036/1036 frames, -14.2 LUFS, A/V diff 0ms, black=0, freeze=1)
- **Domain & Storyboard (A2/A4/B3):** **PASS** (0 error)
- **Panah per frame (B1):** **PASS** (0 error)
- **TTS Manifest (C2):** **N/A** (artefak P4E dibuat sebelum manifest C2)
- **Cakupan B2 (jika diuji terhadap key_steps ["self-centering", "geser ke rel luar"]):** **FAIL** seperti diprediksi (Mutasi 35), karena konsep P4E belum memakai `step_id` per langkah di Fact Ledger.

## Kesimpulan
Video kereta P4E **tetap layak tayang** secara teknis, akurasi fakta, dan domain `rail` (0 entitas lintas domain, 0 error teknis). Kegagalan B2 hanya terjadi karena `fact-ledger.json` P4E dibuat sebelum skema `step_id` P4F.
