# Uji Mutasi QC Visual (P3A)

| Mutasi | Komposisi | Target Cek | Status QC | Jumlah Error | Hasil |
|---|---|---|---|---:|---|
| mut1-time-valve | DemoMesin | mechanics (`MECHANICS_INVARIANT`) | FAIL | 29 error | TERTANGKAP |
| mut2-hud-easing | DemoMesin | mechanics (`MECHANICS_HUD_MISMATCH`) | FAIL | 59 error | TERTANGKAP |
| mut3-framing | DemoKereta | framing (`FRAMING_OUT_OF_BOUNDS`) | FAIL | 45 error | TERTANGKAP |
| mut4-hud-overlap | DemoKereta | hudOverlap (`HUD_OVERLAP`) | FAIL | 45 error | TERTANGKAP |
| mut5-hud-format | DemoKereta | hudFormat (`HUD_FORMAT_NOT_ID`) | FAIL | 1 error | TERTANGKAP |
