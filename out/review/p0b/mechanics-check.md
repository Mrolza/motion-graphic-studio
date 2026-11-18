# Mechanics Check — P0b (Mesin 4 Tak)

Verifikasi matematis `solveCrankSlider(crankRadius=0.45, rodLength=1.45, crankCenter=[0, 1.0, 0])`:
- **TDC (Titik Mati Atas):** `1.0 + 1.45 + 0.45 = 2.900`
- **BDC (Titik Mati Bawah):** `1.0 + 1.45 - 0.45 = 2.000`

## Tabel Sudut Engkol vs Posisi Piston & Urutan Katup

| Sudut Engkol | Piston Y | CrankPin (X, Y) | Sudut Batang | Langkah | Katup Hisap | Katup Buang | Busi |
|---:|---:|---|---:|---|---|---|---|
| 0° | 2.900 | 0.000, 1.450 | 0.0° | 1. Hisap | Tutup | Tutup | - |
| 60° | 2.622 | 0.390, 1.225 | 15.6° | 1. Hisap | TERBUKA | Tutup | - |
| 120° | 2.172 | 0.390, 0.775 | 15.6° | 1. Hisap | TERBUKA | Tutup | - |
| 180° | 2.000 | 0.000, 0.550 | 0.0° | 2. Kompresi | Tutup | Tutup | - |
| 240° | 2.172 | -0.390, 0.775 | -15.6° | 2. Kompresi | Tutup | Tutup | - |
| 300° | 2.622 | -0.390, 1.225 | -15.6° | 2. Kompresi | Tutup | Tutup | - |
| 360° | 2.900 | -0.000, 1.450 | -0.0° | 3. Usaha | Tutup | Tutup | BUSI MENYALA |
| 420° | 2.622 | 0.390, 1.225 | 15.6° | 3. Usaha | Tutup | Tutup | - |
| 480° | 2.172 | 0.390, 0.775 | 15.6° | 3. Usaha | Tutup | Tutup | - |
| 540° | 2.000 | 0.000, 0.550 | 0.0° | 4. Buang | Tutup | Tutup | - |
| 600° | 2.172 | -0.390, 0.775 | -15.6° | 4. Buang | Tutup | TERBUKA | - |
| 660° | 2.622 | -0.390, 1.225 | -15.6° | 4. Buang | Tutup | TERBUKA | - |
| 720° | 2.900 | -0.000, 1.450 | -0.0° | TDC (Akhir Siklus) | Tutup | Tutup | - |

## Verifikasi Kode Adegan Gemini
- **Scene1_EngineCutaway:** `solveCrankSlider` = YA, `cutaway/thetaLength` = YA, katup = YA
- **Scene2_IntakeCompression:** `solveCrankSlider` = YA, `cutaway/thetaLength` = YA, katup = YA
- **Scene3_PowerExhaust:** `solveCrankSlider` = YA, `cutaway/thetaLength` = YA, katup = YA
- **Scene4_CycleSummary:** `solveCrankSlider` = YA, `cutaway/thetaLength` = YA, katup = YA
