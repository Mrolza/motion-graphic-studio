# Review P3C Kebenaran Teks di Layar & Variasi Shot — oleh Claude (advisor)

> Tanggal: 20 November 2026 · Branch: `phase/p3b-storyboard-coder` · Status review: **LOLOS, boleh di-merge** dengan tindak lanjut wajib di P4 (bagian A)

## Yang tercapai
- **Tidak ada lagi HUD liar.** Semua teks di kedua video punya `hud_id` storyboard. "Lebar Spoor 1.435 m", "Jarak Tempuh 5,0 m", dan callout tanpa sumber sudah hilang. `onscreen-text.md` lengkap dengan kutipan sumber.
- **Variasi shot terpenuhi:** kereta punya 5 jenis shot (establishing kereta → penampang → diagram → perbandingan → ringkasan), mesin punya 4 jenis dan dibuka dengan blok mesin dari luar.
- **Mesin:** label langkah terikat fase dan satuan tampil "°". Perbaikan P3B masuk.
- **Mutasi 1–6 tertangkap** dengan error yang tepat. Mutasi `sync` kini memakai render sungguhan.
- Panggilan LLM untuk S6–S9: 11 (kereta) dan 9 (mesin). Storyboard 0 error. Durasi video sama dengan VO.

Semua kriteria lolos P3C terpenuhi **sesuai tulisan spec**. Review menemukan **celah di spec saya sendiri**: L5 baru memeriksa *keberadaan* teks dan *angka*, belum memeriksa *makna*. Akibatnya masih ada teks di layar yang menyesatkan.

## Temuan 1 (kritis): angka penggerak yang tampil sebagai fakta
Kereta S4 menampilkan **"Diameter Efektif 6 mm → 14 mm"**. Angka itu sebenarnya `lateralShift` (geseran roda ke samping, nilai animasi), bukan diameter. Akibatnya:
- labelnya salah, karena besaran yang ditampilkan bukan diameter;
- angkanya karangan, karena tidak ada sumber yang menyebut 6 atau 14 mm;
- penonton membacanya sebagai data nyata.

Celahnya: HUD `bind_to_driver` dikecualikan dari pemeriksaan angka-klaim (keputusan P3C §2). Aturan yang benar ada di P4 §A1.

Masalah sejenis yang lebih ringan: counter mesin berlabel "Poros Engkol" menampilkan **sudut** 0–720°. Label harus menyebut besarannya, yaitu "Sudut Poros Engkol".

## Temuan 2 (kritis): makna teks melebihi sumber
| Adegan | Teks di layar | Kutipan sumber | Masalah |
|---|---|---|---|
| Kereta S2 | "Mengikuti tikungan **tanpa** flens bergesekan" | "with **less chance** of the wheel flanges coming in contact" | Berlebihan: "lebih kecil kemungkinannya" menjadi "tidak sama sekali" |
| Kereta S3 | "Inersia membuat roda melaju lurus" | "**Without the conical shape**, a wheel would **tend to** continue in a straight path due to the inertia" | Syarat "tanpa bentuk kerucut" dan "cenderung" hilang |
| Mesin S4 | "Tenaga Mekanis — **Kontinu**" | "This stroke produces mechanical work…" | "Kontinu" tidak ada di sumber, dan menyesatkan: tenaga hanya dihasilkan di 1 dari 4 langkah |
| Kereta S1 | "Stabilitas Rel Kereta" (ilustratif) | — | Topiknya roda kerucut dan tikungan, bukan stabilitas rel |

Verifier L3 (overstatement, lossy paraphrase, non-factual) sudah ada untuk naskah. Pemeriksaan yang sama belum dijalankan pada teks HUD.

## Temuan 3: "penampang" belum berupa penampang
Kereta S2 memang memakai `RailCrossSection`, tetapi hasilnya **wheelset 3D dari kamera perspektif** dengan `taperExaggeration={1}`. Pada skala asli, kemiringan 1:20 (±2,9°) tidak terlihat. Jadi adegan yang seharusnya menjelaskan inti topik (kerucut tapak dan diameter efektif) tidak memperlihatkan keduanya.

## Temuan 4: kereta di shot pembuka terlalu kecil
QC memberi peringatan `FRAMING_TOO_SMALL` di S1 dan S5 (kereta hanya mengisi 11–19% area bebas), tetapi peringatan itu diabaikan. Untuk shot `establishing` dan `summary`, ini harus menjadi error.

## Temuan 5: jeda mati di VO (untuk P4)
Jeda antarkalimat di `timeline.json` kereta mencapai **0,51–0,85 detik** (7 jeda > 0,4 detik). Ini melanggar PRD §13 ("tidak ada hening > 0,4 detik") dan sudah masuk lingkup P4.

## Keputusan
1. P3B/P3C **di-merge ke `main`** (`--no-ff`, tag `p3b-done`).
2. Temuan 1–4 dikerjakan sebagai **bagian A** di `docs/P4-AUDIO-FINAL.md`, sebelum pekerjaan audio. Video final P4 tidak boleh dibuat dari storyboard lama.
