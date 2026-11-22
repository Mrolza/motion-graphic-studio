# Final QC — p2-kereta

- **Status:** **PASS**
- **Video:** 720x1280 @ 30fps (h264/yuv420p), 1036/1036 frames, 34.53s
- **Audio:** aac 48000Hz, -14.2 LUFS, peak -2.9 dBFS, A/V diff 0ms, silence hits=0
- **Visual:** black=0, freeze=1
- **LLM Calls (S1–S12):** 408 (>15!)

## Issues (5)
- [WARNING] (visual) FINAL_FREEZE_FRAME: terdeteksi 1 segmen gambar statis > 1.5s
- [WARNING] (storyboard:S4:S4_H1) TEXT_UNKNOWN_WORD: kata tak dikenal (pengaman) pada Callout "S4_H1"
- [WARNING] (S4:S4_H1) HUD_DUPLICATES_CAPTION: Callout "S4_H1" berbagi 86% kata dengan caption simultan
- [WARNING] (S4:S4_H1) TEXT_UNKNOWN_WORD: kata tak dikenal (pengaman) pada Callout "S4_H1"
- [WARNING] (process) PROCESS_LLM_BUDGET: total panggilan LLM S1–S12 = 408 (> 15 batas PRD §5)
