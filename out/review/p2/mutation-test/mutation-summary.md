# Uji Mutasi Halus (L2, L3, L0b) — p2-kereta

| Mutasi | Target | Deskripsi | Tertangkap Oleh | Status |
|---|---|---|---|---|
| 1. Angka yang mirip | `S2.1` | Ubah angka 1 -> 3 | L2 (S2.1: NUMBER_NOT_IN_CLAIM: angka 3 di naskah tidak ada di klaim rujukan (C1))<br>L3 (S2.1: L3_OVERSTATED: Kutipan asli menyatakan kemiringan '1 in 20', namun teks naskah mengubahnya menjadi '3 banding 20', yang tidak didukung oleh sumber.) | TERTANGKAP |
| 2. Generalisasi berlebihan | `S2.1` | Generalisasi fakta spesifik ke semua kereta di dunia | L3 (S2.1: L3_OVERSTATED: Sumber menyatakan 'Most train wheels' (sebagian besar roda kereta), sedangkan naskah menggeneralisasi menjadi 'Semua kereta api modern di seluruh dunia memakai desain identik ini tanpa pengecualian sedikit pun'.)<br>L0b (error: L0B_NOT_ANSWERING: naskah tidak menjawab pertanyaan topik) | TERTANGKAP |
| 3. Sebab-akibat diubah | `S3.1` | Membalik sebab-akibat fungsi roda/flens menjadi penambah kecepatan | L3 (S3.1: L3_UNSUPPORTED: Kalimat menyatakan mekanisme dirancang untuk membuat kereta melaju dua kali lebih cepat, yang bertentangan dan sama sekali tidak ada dalam kutipan sumber.) | TERTANGKAP |
| 4. Menyimpang dari topik | `S3` | Mengganti satu scene dengan fakta pesawat terbang yang tidak relevan | L0b (warning: L0B_NOTE: Ada bagian yang menyimpang membahas sayap pesawat (S3) yang tidak relevan dengan topik kereta.) | TERTANGKAP |
