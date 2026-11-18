# Uji Mutasi L2 & L3 — p2-kereta

- **Kalimat termutasi:** `S2.1`
- **Teks asli:** "Rangkaian kereta api menggunakan kerangka khusus yang disebut bogie."
- **Mutasi:** menambahkan angka palsu `9.999 km/jam` & klaim absolut `mustahil tergelincir selamanya`.
- **L2 (kode):** 2 isu (error: NUMBER_NOT_IN_CLAIM: angka 9999 di naskah tidak ada di klaim rujukan (C2) | warning: NAME_NOT_IN_CLAIM: nama "Kecepatan" tidak ditemukan di klaim rujukan (C2))
- **L3 (LLM):** 1 isu (error: L3_OVERSTATED: Kutipan menyatakan kecepatan maksimal 120 km/jam, sementara kalimat mengklaim 9.999 km/jam dan mustahil tergelincir, yang merupakan informasi palsu dan berlebihan.)
