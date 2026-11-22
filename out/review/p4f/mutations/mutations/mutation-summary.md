# P4E Mutation Summary (31 Mutasi, 0 panggilan Gemini)

| Mutasi | Layer | Hits | Detail |
|---|---|---:|---|
| mut1-driver-label | L5 | 2 | L5_DRIVER_LABEL_MISMATCH: HUD "M1_H1" ("Diameter Efektif: 8 mm") tidak menyebut besaran "Geser Lateral" |
| mut2-unsourced-driver-value | L5 | 1 | L5_UNSOURCED_DRIVER_VALUE: HUD "M1_H1" bertipe qualitative tetapi menampilkan angka (8) |
| mut3-semantic-overstatement | L5 | 1 | L5_SEMANTIC_OVERSTATEMENT: HUD "M3" ("Tanpa flens") — overstated |
| mut4-dropped-condition | L5 | 1 | L5_SEMANTIC_DROPPED_CONDITION: HUD "M3" ("Tanpa flens") — dropped |
| mut5-off-topic-title | L5 | 1 | L5_OFF_TOPIC_TITLE: HUD "M3" ("Tanpa flens") — off topic |
| mut6-unsourced-number | L4 | 1 | SB_HUD_MISSING_CLAIM: HUD "Callout" memuat angka (320) tanpa claim_ref/bind_to_driver/illustrative |
| mut7-number-mismatch | L4 | 1 | SB_HUD_NUMBER_NOT_IN_CLAIM: angka 99 di HUD "Rasio 1 banding 99" tidak ada di klaim C1 |
| mut8-entity-offscreen | framing | 1 | FRAMING_OUT_OF_BOUNDS: "train_car" bbox=[0,0,100x100] keluar area aman [0..720, 60..1220] |
| mut9-part-hidden | visibility | 1 | VISIBILITY_MISSING_PART: bagian "wheelset.flange" tidak dilaporkan di telemetri |
| mut10-caption-desync | L5 | 1 | CAPTION_DESYNC: kata "Pernahkah" meleset 300ms (> 50ms) |
| mut11-caption-overlap | L5 | 1 | CAPTION_HUD_OVERLAP: takarir bertumpuk dengan HUD "S1_H1" |
| mut12-hud-format | L4 | 2 | SB_HUD_CLAIM_ID_LEAK: teks HUD "90 deg (C1)" membocorkan ID klaim |
| mut13-publish-unknown-url | publish | 1 | unknown: https://example.com/fake |
| mut14-empty-hud | L4 | 1 | validated in p4b tests |
| mut15-budget-cap | budget | 1 | RunLlmTracker(20) throws LlmBudgetExceededError |
| mut16-cache-hash | cache | 1 | computeStableHash invalidates on change |
| mut17-hedge-dropped-abs-added | L1 | 2 | L1_HEDGE_DROPPED, L1_ABSOLUTE_ADDED |
| mut18-l1-embellished | L1 | 1 | L1_EMBELLISHED: klaim M18 melebih-lebihkan kutipan (speed not in quote) |
| mut19-p4-kereta-overlap-regression | L5 | 176 | first overlap @ f150 (5.00s) |
| mut20-narration-hud-conflict | L5 | 1 | L5_NARRATION_HUD_CONFLICT: HUD "M20" ("Tanpa gesekan") dan narasi "Peluang lebih kecil bergesekan." merujuk klaim sama (C1) dengan kontradiksi mutlak vs hedge |
| mut21-hud-duplicates-caption | L5 | 1 | HUD_DUPLICATES_CAPTION: KineticTitle "M21" berbagi 100% kata dengan narasi/caption |
| mut22-multi-claim-unverified | L4 | 1 | SB_UNVERIFIED_CLAIM: claim_ref "C_BAD" tidak ditemukan atau belum verified |
| mut23-final-pixfmt | technical | 1 | FINAL_PIXFMT: pixel format "yuv444p" bukan yuv420p |
| mut24-script-hedge-dropped | L2 | 1 | L2_HEDGE_DROPPED: kalimat naskah membuang kata lunak ("tend to" -> butuh (cenderung)) |
| mut25-c1-c7-regression | L1 | 1 | C1=verified, C7=verified |
| mut26-a2-reparaphrase | L1 | 1 | repaired: Piston memampatkan campuran udara dan bahan bakar. |
| mut27-step-missing | L0b | 4 | L0B_STEP_MISSING: langkah proses "Hisap" belum punya kalimat khusus dengan klaim verified bertanda step_id="Hisap" |
| mut28-arrow-mismatch | mechanics | 1 | VIS_ARROW_DIRECTION_MISMATCH: panah "arrow" hanya cocok arah 0/1 frame (0.0% < 95%) terhadap "piston" |
| mut29-spellcheck-typo | L4 | 1 | TEXT_UNKNOWN_WORD: kata tak dikenal (Tegelincir) pada KineticTitle "S1_H1" |
| mut30-publish-hedge-dropped | publish | 1 | L2_HEDGE_DROPPED: publish.md membuang kata lunak pada "Tanpa bentuk kerucut, roda akan melaju lurus." |
| mut31-three-runs-zero-calls | cache | 1 | validated in p4eCalibration.test.ts (run2=0, run3=0) |
