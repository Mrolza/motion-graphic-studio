import type { VideoFormat } from '@core/contracts/project';

export interface FormatPack {
  id: VideoFormat;
  name: string;
  requires_research: boolean;
  structure: string[];
  hook_archetypes: string[];
  fact_rules: string[];
}

export const FORMAT_PACKS: FormatPack[] = [
  {
    id: 'how_it_works',
    name: 'How Things Work (Mekanisme)',
    requires_research: true,
    structure: [
      '1. Hook (0-3s): Pertanyaan atau fakta kontra-intuitif tentang mekanisme.',
      '2. Prinsip Inti (3-15s): Komponen utama dan bagaimana mereka saling terhubung.',
      '3. Bukti / Angka Kunci (15-30s): Ukuran, gaya, atau angka teknis terverifikasi.',
      '4. Payoff (30-45s): Ringkasan kenapa mekanisme ini berhasil atau gagal.',
    ],
    hook_archetypes: [
      'Counter-Intuitive Mechanism (Melaju kencang tanpa setir—bagaimana caranya?)',
      'Hidden Component (Satu bagian kecil ini yang mencegah bencana...)',
    ],
    fact_rules: [
      'Setiap angka teknis, dimensi, atau kecepatan wajib merujuk klaim verified di Fact Ledger.',
      'Penjelasan mekanisme yang tidak disebut langsung di sumber ditandai wajar tanpa mengarang angka.',
    ],
  },
  {
    id: 'how_its_made',
    name: "How It's Made (Proses Produksi)",
    requires_research: true,
    structure: [
      '1. Hook (0-3s): Produk sehari-hari dengan fakta produksi yang mengejutkan.',
      '2. Bahan Baku & Tahap Awal (3-15s): Transformasi pertama bahan mentah.',
      '3. Proses Kritis (15-30s): Suhu, tekanan, atau langkah presisi yang menentukan kualitas.',
      '4. Hasil Akhir (30-45s): Skala produksi atau fakta penutup yang berkesan.',
    ],
    hook_archetypes: [
      'Process Mystery (Dari bahan sederhana ini menjadi produk presisi...)',
      'Scale Contrast (Jutaan unit dibuat tiap hari lewat langkah ini...)',
    ],
    fact_rules: [
      'Suhu, waktu proses, dan bahan wajib merujuk klaim verified di Fact Ledger.',
    ],
  },
  {
    id: 'technical',
    name: 'Teknikal / Otomotif',
    requires_research: true,
    structure: [
      '1. Hook (0-3s): Masalah rekayasa konkret yang harus dipecahkan.',
      '2. Anatomi Sistem (3-15s): Bagian-bagian utama dan fungsinya.',
      '3. Siklus / Cara Kerja (15-32s): Urutan langkah mekanis atau termodinamika.',
      '4. Takeaway (32-45s): Kenapa desain ini bertahan dan efisien.',
    ],
    hook_archetypes: [
      'Engineering Puzzle (Bagaimana satu komponen menahan ribuan ledakan per menit?)',
      'Precision Proof (Selisih milimeter saja bisa mengubah segalanya...)',
    ],
    fact_rules: [
      'Semua angka teknis (langkah, rasio, ukuran, tahun) wajib merujuk klaim verified.',
    ],
  },
  {
    id: 'what_if',
    name: 'What If (Skenario Hipotetis)',
    requires_research: true,
    structure: [
      '1. Hook (0-3s): Premis skenario hipotetis konkret.',
      '2. Dampak Awal (3-15s): Akibat fisik pertama berdasarkan hukum alam nyata.',
      '3. Eskalasi (15-32s): Rantai akibat skala besar berbasis fakta nyata.',
      '4. Payoff (32-45s): Fakta nyata mengejutkan sebagai penutup.',
    ],
    hook_archetypes: [
      'Consequence Shock (Apa yang terjadi dalam 5 detik pertama jika...)',
    ],
    fact_rules: [
      'Skenario boleh hipotetis, tetapi bagian pengandaian wajib memakai bahasa pengandaian ("diperkirakan", "kemungkinan", "akan").',
      'Setiap angka nyata (kecepatan, ukuran, jarak) wajib merujuk klaim verified.',
    ],
  },
  {
    id: 'today_in_history',
    name: 'Today in History (Hari Ini dalam Sejarah)',
    requires_research: true,
    structure: [
      '1. Hook (0-3s): Tanggal & tahun spesifik + kejadian utama nyata (wajib dari artikel utama kejadian).',
      '2. Kejadian Utama & Konteks (3-15s): Uraikan kejadian utama lengkap dengan tanggal dan tahunnya + tokoh/situasi.',
      '3. Titik Balik Sejarah (15-32s): Peristiwa kunci yang terjadi.',
      '4. Dampak Hingga Kini (32-45s): Relevansi peristiwa hingga hari ini.',
    ],
    hook_archetypes: [
      'Date-Pinned Turning Point (Tepat pada tanggal ini di tahun XXXX...)',
    ],
    fact_rules: [
      'Hanya gunakan fakta dari Fact Ledger hasil riset Wikimedia/Wikipedia.',
      'Adegan 1–2 wajib menyebut nama kejadian/misi utama secara eksplisit (mis. "Apollo 11") serta tanggal dan tahunnya, bersumber dari artikel utama.',
      'Tanggal, tahun, nama tokoh, dan tempat wajib sama persis dengan sumber.',
    ],
  },
];

export function getFormatPack(id: VideoFormat): FormatPack {
  return FORMAT_PACKS.find((f) => f.id === id) ?? FORMAT_PACKS[0]!;
}
