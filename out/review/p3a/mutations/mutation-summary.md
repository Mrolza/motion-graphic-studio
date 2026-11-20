# Uji Mutasi QC Visual (P3A2 — 10 Mutasi)

| Mutasi | Komposisi | Target Cek | Status QC | Jumlah Error | Hasil |
|---|---|---|---|---:|---|
| mut1-time-valve | DemoMesin | mechanics (`MECHANICS_INVARIANT`) | FAIL | 29 error | TERTANGKAP |
| mut2-hud-easing | DemoMesin | mechanics (`MECHANICS_HUD_MISMATCH`) | FAIL | 59 error | TERTANGKAP |
| mut3-framing | DemoKereta | framing (`FRAMING_OUT_OF_BOUNDS`) | FAIL | 57 error | TERTANGKAP |
| mut4-hud-overlap | DemoKereta | hudOverlap (`HUD_OVERLAP`) | FAIL | 76 error | TERTANGKAP |
| mut5-hud-format | DemoKereta | hudFormat (`HUD_FORMAT_NOT_ID`) | FAIL | 1 error | TERTANGKAP |
| mut6-lift-wheel | DemoKereta | geometry (`GEOMETRY_VIOLATION`) | FAIL | 114 error | TERTANGKAP |
| mut7-rotate-axle | DemoKereta | geometry (`GEOMETRY_VIOLATION`) | FAIL | 57 error | TERTANGKAP |
| mut8-detach-rod | DemoMesin | geometry (`GEOMETRY_VIOLATION`) | FAIL | 120 error | TERTANGKAP |
| mut9-occlude-crank | DemoMesin | visibility (`VISIBILITY_OCCLUDED_BY_HUD`) | FAIL | 59 error | TERTANGKAP |
| mut10-three-panels | DemoKereta | hudOverlap (`HUD_BUDGET_EXCEEDED`) | FAIL | 38 error | TERTANGKAP |
