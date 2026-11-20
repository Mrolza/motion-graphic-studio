# Uji Mutasi P3C (6 Mutasi — Render & Telemetri Sungguhan)

| Mutasi | Layer | Jumlah Error | Pesan Pertama |
|---|---|---:|---|
| mut1-unsanctioned-hud | onscreenTruth (L5) | 5 | L5_UNSANCTIONED_HUD: elemen HUD "measure_taper" ("Kemiringan Tapak Kerucut: 1:20 (dilebihkan)") tidak ada di storyboard |
| mut2-fact-mismatch | onscreenTruth (L5) | 3 | L5_FACT_MISMATCH: angka 1,435 pada HUD "measure_taper" tidak cocok dengan klaim C1 |
| mut3-phase-hud | mechanics | 44 | MECHANICS_HUD_OUT_OF_PHASE: HUD "stat_crank_angle" tampil pada driver=0 di luar rentang [360,540] |
| mut4-deg-unit | hudFormat | 1 | HUD_UNNORMALIZED_UNIT: "callout_deg_mut" menampilkan satuan "deg" (gunakan "°" tanpa spasi) pada "Sudut Aktif — 524 deg" |
| mut5-shot-variety | Storyboard QC | 5 | SB_LOW_SHOT_VARIETY: hanya 1 jenis shot_type berbeda (minimal 3 per video) |
| mut6-sync-real-render | sync | 1 | SYNC_OUT_OF_WINDOW: gerak utama "crank_angle" mulai pada 1.60s (target 0.00s ±0.35s) |
