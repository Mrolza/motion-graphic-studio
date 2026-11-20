# Tindak Lanjut REVIEW-P2C (Langkah 0 P3A)

> Tanggal: 2026-11-20T11:39:35.892Z · Branch: `phase/p2-facts-script`

## 4 Tindak Lanjut yang Diterapkan
1. **`CLAIM_NAME_NOT_IN_QUOTE` (`src/core/qc/l1-ledger.ts`):** nama diri pada teks klaim wajib muncul di kutipan sumber (dengan padanan umum ID/EN seperti `Bulan`↔`Moon`).
2. **`hook_paid` di L0b (`src/core/qc/l0b-quality.ts`):** error `L0B_HOOK_UNPAID` jika janji/topik hook di S1 tidak dibahas di isi naskah.
3. **Nama kejadian utama di `today_in_history` (`l0b-quality.ts`, `format-packs.ts`, `scriptwriter.md`):** `main_event_named` wajib `true` (error `L0B_MISSING_MAIN_EVENT_NAME` jika nama misi/kejadian seperti `Apollo 11` tidak disebut).
4. **`llm_calls_last_run` terpisah (`project.ts`, `store.ts`, `gate1.ts`, `script.ts`):** mencatat panggilan LLM run terakhir terpisah dari `llm_calls` kumulatif.

## Hasil Uji Ulang S4 (`p2-history-0720`)
- **L1 re-check errors (termasuk `CLAIM_NAME_NOT_IN_QUOTE`):** `C1`: CLAIM_FACT_NOT_IN_QUOTE: angka/tahun/tanggal pada teks klaim tidak muncul di kutipan; `C2`: CLAIM_NAME_NOT_IN_QUOTE: nama diri (Buzz) pada teks klaim tidak muncul di kutipan; `C3`: CLAIM_NAME_NOT_IN_QUOTE: nama diri (Neil) pada teks klaim tidak muncul di kutipan; `C5`: CLAIM_FACT_NOT_IN_QUOTE: angka/tahun/tanggal pada teks klaim tidak muncul di kutipan; `C7`: CLAIM_NAME_NOT_IN_QUOTE: nama diri (Neil) pada teks klaim tidak muncul di kutipan; `C8`: QUOTE_FRAGMENT: kutipan harus berupa kalimat utuh dari sumber, bukan potongan frasa; `C11`: QUOTE_FRAGMENT: kutipan harus berupa kalimat utuh dari sumber, bukan potongan frasa; `C15`: CLAIM_FACT_NOT_IN_QUOTE: angka/tahun/tanggal pada teks klaim tidak muncul di kutipan; `C16`: CLAIM_FACT_NOT_IN_QUOTE: angka/tahun/tanggal pada teks klaim tidak muncul di kutipan
- **S4 sebelum rewrite:** 1 error (`S4.2` NON_FACTUAL_ASSERTION)
- **Rewrite (maks 1x):** ya
- **S4 setelah rewrite:** 0 error (none)
- **Gerbang 1:** **APPROVED**
- **Panggilan LLM:** `llm_calls_last_run` = **2**, `llm_calls` (kumulatif) = **15**
