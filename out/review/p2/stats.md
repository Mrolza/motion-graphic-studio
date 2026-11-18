# Statistik Uji End-to-End P2 (Gerbang 1)

> Tanggal: 2026-11-18 · Model: `gemini-3.5-flash-lite` · Status E2E: **PARTIAL (1/3 topik selesai; 2/3 terhenti karena `Gemini HTTP 503 UNAVAILABLE` berkepanjangan)**

| Topik | Format | Panggilan LLM | Klaim Verified / Unverified | Error L2 | Temuan L3 | Status Gerbang 1 |
|---|---|---|---:|---|---|---|
| `p2-kereta` ("Kenapa kereta tidak tergelincir?") | `how_it_works` | 6 (S1:1, S2:3, S3:1, S4:1) | 5 / 2 (`C1: SOURCE_NOT_FOUND`, `C7: QUOTE_NOT_IN_SOURCE`) | 0 | 0 error, 0 warn | **APPROVED** |
| `p2-mesin4tak` ("Bagaimana mesin 4 tak bekerja?") | `technical` | - | - | - | - | **BLOCKED (HTTP 503 UNAVAILABLE)** |
| `p2-history-0720` ("Peristiwa bersejarah tanggal 07-20") | `today_in_history` | - | - | - | - | **NOT RUN (terhenti setelah 503)** |

## Uji Mutasi L2 & L3 (`out/review/p2/mutation-test/`)
- **Status:** **LULUS**
- **Mutasi:** Menambahkan angka palsu `9.999 km/jam` dan klaim absolut `mustahil tergelincir selamanya` pada `S2.1` di `p2-kereta` tanpa mengubah `fact-ledger.json`.
- **Hasil L2:** Menangkap `NUMBER_NOT_IN_CLAIM` (angka `9999` tidak ada di `C2`) dan warning `NAME_NOT_IN_CLAIM`.
- **Hasil L3:** Menangkap `L3_OVERSTATED` ("Kutipan menyatakan kecepatan maksimal 120 km/jam, sementara kalimat mengklaim 9.999 km/jam dan mustahil tergelincir").
