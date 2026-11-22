# Final QC — p2-mesin4tak

- **Status:** **PASS**
- **Video:** 720x1280 @ 30fps (h264/yuv420p), 1314/1314 frames, 43.80s
- **Audio:** aac 48000Hz, -14.1 LUFS, peak -2.7 dBFS, A/V diff 0ms, silence hits=0
- **Visual:** black=0, freeze=1
- **LLM Calls (S1–S12):** 323 (>15!)

## Issues (9)
- [WARNING] (visual) FINAL_FREEZE_FRAME: terdeteksi 1 segmen gambar statis > 1.5s
- [WARNING] (storyboard:S4:S4_H2) TEXT_UNKNOWN_WORD: kata tak dikenal (Total) pada Callout "S4_H2"
- [WARNING] (S1:S1_H2) HUD_DUPLICATES_CAPTION: Callout "S1_H2" berbagi 100% kata dengan caption simultan
- [WARNING] (S2:S2_H1) HUD_DUPLICATES_CAPTION: Callout "S2_H1" berbagi 100% kata dengan caption simultan
- [WARNING] (S3:S3_H1) HUD_DUPLICATES_CAPTION: Callout "S3_H1" berbagi 100% kata dengan caption simultan
- [WARNING] (S3:S3_H2) HUD_DUPLICATES_CAPTION: Callout "S3_H2" berbagi 100% kata dengan caption simultan
- [WARNING] (S4:S4_H2) HUD_DUPLICATES_CAPTION: Callout "S4_H2" berbagi 75% kata dengan caption simultan
- [WARNING] (S4:S4_H2) TEXT_UNKNOWN_WORD: kata tak dikenal (Total) pada Callout "S4_H2"
- [WARNING] (process) PROCESS_LLM_BUDGET: total panggilan LLM S1–S12 = 323 (> 15 batas PRD §5)
