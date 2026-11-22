# Final QC — p2-mesin4tak

- **Status:** **PASS**
- **Video:** 720x1280 @ 30fps (h264/yuv420p), 910/910 frames, 30.33s
- **Audio:** aac 48000Hz, -14.5 LUFS, peak -3 dBFS, A/V diff 0ms, silence hits=0
- **Visual:** black=0, freeze=0
- **LLM Calls (S1–S12):** 193 (>15!)

## Issues (6)
- [WARNING] (S2:S2_H2) HUD_DUPLICATES_CAPTION: Callout "S2_H2" berbagi 80% kata dengan caption simultan
- [WARNING] (S3:S3_H1) HUD_DUPLICATES_CAPTION: Callout "S3_H1" berbagi 100% kata dengan caption simultan
- [WARNING] (S4:S4_H1) HUD_DUPLICATES_CAPTION: Callout "S4_H1" berbagi 83% kata dengan caption simultan
- [WARNING] (S4:S4_H2) HUD_DUPLICATES_CAPTION: Callout "S4_H2" berbagi 80% kata dengan caption simultan
- [WARNING] (S5:S5_H1) HUD_DUPLICATES_CAPTION: Callout "S5_H1" berbagi 80% kata dengan caption simultan
- [WARNING] (process) PROCESS_LLM_BUDGET: total panggilan LLM S1–S12 = 193 (> 15 batas PRD §5)
