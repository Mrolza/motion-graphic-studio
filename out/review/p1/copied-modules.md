# Copied Modules from `D:\content-studio` — P1

| Sumber (`content-studio`) | Tujuan (`motion-graphic-studio`) | Perubahan yang Dilakukan | Test & Hasil |
|---|---|---|---|
| `lib/media/tts.ts` | `src/core/audio/tts.ts` | Tidak ada perubahan logika | `tests/copied/tts.test.ts`: **2/2 lulus** |
| `lib/media/audio-mix.ts` | `src/core/audio/audio-mix.ts` | Impor `@/lib/media/timeline` → `@core/timeline/timeline`; `resolveExistingSfxPath` cek `remotion/public/sfx/` lalu fallback `public/sfx/` | `tests/copied/audioMix.test.ts`: **3/3 lulus** |
| `lib/media/beats.ts` | `src/core/timeline/beats.ts` | Tidak ada perubahan | `tests/copied/beats.test.ts`: **2/2 lulus** (blok test `expandScenesToBeats` dari `executor.ts` dihapus) |
| `lib/media/timeline.ts` | `src/core/timeline/timeline.ts` | Impor `@/lib/media/...` → `@core/timeline/beats`, `@core/audio/tts` | `tests/copied/timeline.test.ts`: **4/4 lulus** |
| `lib/render/captions.ts` | `src/core/render/captions.ts` | Impor `@/lib/media/tts` → `@core/audio/tts` | Dicakup `tsc --noEmit` (0 error) |
| `lib/media/quota.ts` | `src/core/assets/quota.ts` | Tidak ada perubahan | `tests/copied/quota.test.ts`: **5/5 lulus** |
| `lib/media/cache.ts` | `src/core/assets/cache.ts` | Tidak ada perubahan | Dipakai di test/modul `commons` & `providers` |
| `lib/media/providers.ts` | `src/core/assets/provider-local-cf.ts`, `provider-remote.ts`, `providers.ts` | Dipecah menjadi 3 file agar tiap file ≤ 400 baris (`AG-RULES.md`); impor ke `@core/assets/...`; tanpa ketergantungan ke `executor.ts` | `tests/copied/providers.test.ts`: **6/6 lulus** |
| `lib/research/commons.ts` | `src/core/research/commons.ts` | Impor `@/lib/media/cache` → `@core/assets/cache` | Diuji via `tests/copied/wikimedia.test.ts` (2 test Commons) |
| `lib/research/wikimedia.ts` | `src/core/research/wikimedia.ts` | Impor `ScriptV2ResearchPackage` dari `script-v2.ts` diganti interface lokal `WikimediaResearchPackage`; impor `@/lib/research/commons` → `@core/research/commons` | `tests/copied/wikimedia.test.ts`: **4/4 lulus** (dengan fixture `wikimedia-onthisday-07-20.json`) |
| `lib/engine/gemini-config.ts` | `src/core/llm/gemini-config.ts` | Ditambah `DEFAULT_GEMINI_MODEL` & `resolveGeminiModel()` | Diuji via `tests/llmClient.test.ts` |
| `remotion/public/fonts/*`, `public/sfx/*` | `remotion/public/fonts/`, `remotion/public/sfx/` | Disalin beserta file lisensi (`OFL-*.txt`, `LICENSE.txt`) & dicatat di `THIRD_PARTY_NOTICES.md` | Dipakai oleh `audioMix.test.ts` |
