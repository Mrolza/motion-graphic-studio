# P4D E2E Stats & LLM Call Telemetry

## p2-kereta (standar)
- Total panggilan Gemini (kumulatif llm-calls.jsonl): **67** across **25** runs (max **9** calls/run)
- Per tahap: {"S8":26,"S9":7,"S6":3,"S7":31}
- Render timing: 49960 ms
- S6: 4 ms | S7: 824 ms | S8: 11 ms
- Final QC: PASS (yuv420p, 720x1280)

## p2-mesin4tak (hemat)
- Total panggilan Gemini (kumulatif llm-calls.jsonl): **77** across **11** runs (max **14** calls/run)
- Per tahap: {"S6":4,"S7":32,"S8":24,"S9":17}
- Render timing: dipakai ulang
- S6: 0 ms | S7: 0 ms | S8: 0 ms
- Final QC: PASS (yuv420p, 720x1280)
