# Uji Mutasi P4B (16 Mutasi Lengkap — Non-LLM & Real-Render MP4)

| Mutasi | Layer | Error | Pesan Pertama |
|---|---|---:|---|
| mut1-driver-label | L5 | 2 | L5_DRIVER_LABEL_MISMATCH: HUD "M1" ("Diameter Efektif: 8 mm") tidak menyebut besaran "Geser Lateral" |
| mut2-unsourced-driver-value | L5 | 1 | L5_UNSOURCED_DRIVER_VALUE: HUD "M1" bertipe qualitative tetapi menampilkan angka (8) |
| mut3-semantic-precheck | L5 Semantic Precheck | 1 | L5_ABSOLUTE_WORD: kata mutlak (tanpa) di HUD dipadukan dengan kata lunak (less, chance) di kutipan |
| mut4-cross-section-view-and-badge | L4 + Visibility | 2 | SHOT_VIEW_MISMATCH: shot_type="cross_section" wajib memakai rail_cross_section / view="section" (bukan wheelset) / VIS_EXAGGERATION_UNLABELED: "rail_cross_section" memakai taperExaggeration=5 tanpa badge "skala dilebihkan" |
| mut5-establishing-framing | Framing | 1 | FRAMING_TOO_SMALL: "train_car" hanya mengisi 15% zona bebas (< 30%) |
| mut6-caption-mismatch | Captions | 1 | CAPTION_TEXT_MISMATCH: teks takarir tidak sama persis dengan narasi naskah |
| mut7-caption-hud-overlap | Captions | 1 | CAPTION_HUD_OVERLAP: takarir bertumpuk dengan HUD "S1_H1" |
| mut12-publish-unknown-url | Publish | 1 | PUBLISH_UNKNOWN_SOURCE: https://unknown.example.org/fake |
| mut13-budget-limit-3 | Budget | 1 | LLM_BUDGET_EXCEEDED: batas 3 panggilan logis per run tercapai sebelum S8 (mock). State disimpan agar run dapat dilanjutkan. |
| mut14-partial-scene-reuse | Scene Cache (Mock LLM) | 1 | Re-run generated 2 scenes, reused 1 cached scene(s) |
| mut15-kit-fault-no-s9 | Kit Ownership | 1 | KIT_FAULT: S2 gagal karena kesalahan milik kit ([framing:kit] f0: FRAMING_OUT_OF_BOUNDS) (S9 calls=0) |
| mut16-callout-14-words | Storyboard QC | 1 | HUD_TOO_LONG: Callout "S2_H1" berisi 17 kata (maks 8 kata, error > 12 kata) |
| mut8-loudness-20lufs | Final QC Audio | 1 | FINAL_LOUDNESS: -20.3 LUFS / -8.6 dBFS di luar target [-15..-13 LUFS, <= -1.5 dBTP] |
| mut9-dead-air-0.8s | Final QC Audio | 1 | FINAL_DEAD_AIR: terdeteksi 1 jeda hening >= 0.4s pada audio mix |
| mut10-black-frames-0.5s | Final QC Visual | 1 | FINAL_BLACK_FRAMES: terdeteksi 1 segmen frame hitam >= 0.1s |
| mut11-frame-count-mismatch | Final QC Tech | 1 | FINAL_FRAME_COUNT: jumlah frame 1042 != target 1072 |
