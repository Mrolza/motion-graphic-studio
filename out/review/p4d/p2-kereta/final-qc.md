# Final QC — p2-kereta

- **Status:** **PASS**
- **Video:** 720x1280 @ 30fps (h264/yuv420p), 1093/1093 frames, 36.43s
- **Audio:** aac 48000Hz, -14.3 LUFS, peak -2.7 dBFS, A/V diff 12ms, silence hits=0
- **Visual:** black=0, freeze=0
- **LLM Calls (S1–S12):** 382 (>15!)

## Issues (5)
- [WARNING] (S2:S2_H1) HUD_DUPLICATES_CAPTION: Callout "S2_H1" berbagi 75% kata dengan caption simultan
- [WARNING] (S4:S4_H1) HUD_DUPLICATES_CAPTION: Callout "S4_H1" berbagi 100% kata dengan caption simultan
- [WARNING] (S4:S4_H2) HUD_DUPLICATES_CAPTION: Callout "S4_H2" berbagi 100% kata dengan caption simultan
- [WARNING] (S5:S5_H1) HUD_DUPLICATES_CAPTION: Callout "S5_H1" berbagi 100% kata dengan caption simultan
- [WARNING] (process) PROCESS_LLM_BUDGET: total panggilan LLM S1–S12 = 382 (> 15 batas PRD §5)
