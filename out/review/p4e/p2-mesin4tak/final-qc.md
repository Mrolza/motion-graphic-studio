# Final QC — p2-mesin4tak

- **Status:** **PASS**
- **Video:** 720x1280 @ 30fps (h264/yuv420p), 1123/1123 frames, 37.43s
- **Audio:** aac 48000Hz, -14.3 LUFS, peak -2.6 dBFS, A/V diff 4ms, silence hits=0
- **Visual:** black=0, freeze=0
- **LLM Calls (S1–S12):** 273 (>15!)

## Issues (11)
- [WARNING] (storyboard:S3:S3_H2) TEXT_UNKNOWN_WORD: kata tak dikenal (dipadatkan) pada Callout "S3_H2"
- [WARNING] (storyboard:S5:S5_H1) TEXT_UNKNOWN_WORD: kata tak dikenal (proses) pada Callout "S5_H1"
- [WARNING] (S2:S2_H1) HUD_DUPLICATES_CAPTION: Callout "S2_H1" berbagi 75% kata dengan caption simultan
- [WARNING] (S3:S3_H1) HUD_DUPLICATES_CAPTION: Callout "S3_H1" berbagi 86% kata dengan caption simultan
- [WARNING] (S3:S3_H2) HUD_DUPLICATES_CAPTION: Callout "S3_H2" berbagi 83% kata dengan caption simultan
- [WARNING] (S4:S4_H1) HUD_DUPLICATES_CAPTION: Callout "S4_H1" berbagi 100% kata dengan caption simultan
- [WARNING] (S4:S4_H2) HUD_DUPLICATES_CAPTION: Callout "S4_H2" berbagi 88% kata dengan caption simultan
- [WARNING] (S5:S5_H1) HUD_DUPLICATES_CAPTION: Callout "S5_H1" berbagi 86% kata dengan caption simultan
- [WARNING] (S3:S3_H2) TEXT_UNKNOWN_WORD: kata tak dikenal (dipadatkan) pada Callout "S3_H2"
- [WARNING] (S5:S5_H1) TEXT_UNKNOWN_WORD: kata tak dikenal (proses) pada Callout "S5_H1"
- [WARNING] (process) PROCESS_LLM_BUDGET: total panggilan LLM S1–S12 = 273 (> 15 batas PRD §5)
