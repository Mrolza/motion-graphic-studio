import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import { extractHudDisplayText, QUANTITY_LABELS } from './l5-semantic';

const BASE_ID_WORDS = new Set([
  // Function & common words
  'ada', 'adalah', 'agar', 'akan', 'akibat', 'antara', 'apa', 'atau', 'awal', 'bagaimana',
  'bagian', 'baik', 'banyak', 'baru', 'bawah', 'beberapa', 'bekerja', 'belok', 'berbelok',
  'berbeda', 'berbentuk', 'bergerak', 'bergesekan', 'berikut', 'berjalan', 'bersentuhan',
  'berfungsi', 'besar', 'biasa', 'biasanya', 'bisa', 'bukan', 'cara', 'cenderung', 'contoh',
  'dalam', 'dan', 'dapat', 'dari', 'dengan', 'di', 'diarahkan', 'didorong', 'dilebihkan',
  'dipasang', 'dua', 'efek', 'efektif', 'efisien', 'empat', 'energi', 'fakta', 'fitur',
  'flens', 'flensa', 'gandar', 'gaya', 'gelincir', 'gerak', 'geser', 'hanya', 'harus',
  'hasil', 'hemat', 'ilustrasi', 'inersia', 'ini', 'itu', 'jadi', 'jalan', 'jalur', 'jarak',
  'jauh', 'jika', 'juga', 'kaku', 'karena', 'ke', 'kecil', 'kedua', 'kelembaman', 'keluar',
  'keluarnya', 'kemiringan', 'kemudi', 'kemungkinan', 'kenapa', 'kereta', 'api', 'kerucut',
  'ketika', 'kiri', 'kanan', 'komponen', 'kompresi', 'kontak', 'kurang', 'langkah', 'lateral',
  'lebih', 'lurus', 'luar', 'maka', 'mampu', 'maupun', 'mekanisme', 'melaju', 'membesar',
  'membuat', 'memiliki', 'memperbesar', 'mendorong', 'menempuh', 'mengalami', 'mengapa',
  'mengarah', 'mengecil', 'mengikuti', 'menghasilkan', 'menghindari', 'mengubah', 'menjaga',
  'menuju', 'menyebabkan', 'menyentuh', 'merupakan', 'mesin', 'miring', 'naik', 'nilai',
  'oleh', 'pada', 'panjang', 'panah', 'pasti', 'peluang', 'pelindung', 'pembakaran', 'penampang',
  'pengarah', 'perbandingan', 'perangkat', 'perbedaan', 'perlu', 'persimpangan', 'piston',
  'poros', 'engkol', 'posisi', 'progres', 'putaran', 'rasio', 'rel', 'risiko', 'roda',
  'saat', 'saja', 'sama', 'samping', 'satu', 'sebab', 'sebagian', 'sebagai', 'sebelah',
  'secara', 'sedikit', 'sehingga', 'sekitar', 'selain', 'selalu', 'semua', 'sepanjang',
  'sering', 'setiap', 'setir', 'siklus', 'silinder', 'sisi', 'skala', 'stabil', 'sudut',
  'sumber', 'tak', 'tanpa', 'tapak', 'tekanan', 'tengah', 'tentang', 'terjadi', 'terbuka',
  'terdapat', 'tergelincir', 'terpasang', 'tertutup', 'terus', 'tetap', 'tidak', 'tiga',
  'tikungan', 'tinggi', 'tonjolan', 'topik', 'turun', 'udara', 'umumnya', 'untuk', 'usaha',
  'tenaga', 'utama', 'waktu', 'yang',
  // Engine & general science/tech
  'hisap', 'buang', 'busi', 'katup', 'bakar', 'bahan', 'campuran', 'ledakan', 'dorong',
  'dorongan', 'isap', 'langkahnya', 'masuk', 'mengisap', 'memampatkan', 'menyalakan',
  'membuang', 'percikan', 'ruang', 'sumbu', 'torsi', 'kecepatan', 'jarang', 'banding',
  'derajat', 'mm', 'cm', 'm', 'km', 'jam', 'rpm', 'cc', 'vs', 'atas', 'bantu', 'membantu',
  'memungkinkan', 'mengurangi', 'mempertahankan', 'menunjukkan', 'menjelaskan', 'lihat',
]);

const PREFIXES = ['ter', 'ber', 'meng', 'meny', 'mem', 'men', 'me', 'di', 'ke', 'per', 'pe', 'se'];
const SUFFIXES = ['nya', 'kan', 'an', 'i'];

function isKnownIdWord(word: string, extraWords: Set<string>): boolean {
  const w = word.toLowerCase();
  if (w.length <= 1 || /^\d+([.,]\d+)?$/.test(w)) return true;
  if (BASE_ID_WORDS.has(w) || extraWords.has(w)) return true;

  // Strip common Indonesian prefixes/suffixes and check root
  const candidates = new Set<string>([w]);
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      candidates.add(w.slice(0, -suf.length));
    }
  }
  for (const cand of [...candidates]) {
    for (const pre of PREFIXES) {
      if (cand.startsWith(pre) && cand.length > pre.length + 2) {
        candidates.add(cand.slice(pre.length));
      }
    }
  }
  for (const c of candidates) {
    if (BASE_ID_WORDS.has(c) || extraWords.has(c)) return true;
  }
  return false;
}

function tokenizeWords(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !/^\d+$/.test(w));
}

export function checkHudSpelling(
  storyboard: Storyboard,
  context?: { topic?: string; script?: Script; ledger?: FactLedger }
): QcIssue[] {
  const issues: QcIssue[] = [];
  const extraWords = new Set<string>();

  const addTextToAllowlist = (txt: string | undefined) => {
    if (!txt) return;
    for (const w of tokenizeWords(txt)) extraWords.add(w.toLowerCase());
  };

  addTextToAllowlist(context?.topic);
  for (const lbl of Object.values(QUANTITY_LABELS)) addTextToAllowlist(lbl);
  if (context?.script) {
    for (const sc of context.script.scenes) {
      for (const s of sc.sentences) addTextToAllowlist(s.text);
    }
  }
  if (context?.ledger) {
    for (const c of context.ledger.claims) {
      addTextToAllowlist(c.text);
      for (const src of c.sources) addTextToAllowlist(src.title);
    }
  }

  for (const sc of storyboard.scenes) {
    sc.hud.forEach((h, idx) => {
      if (h.component !== 'KineticTitle' && h.component !== 'Callout') return;
      const hid = h.hud_id ?? `${sc.id}_H${idx + 1}`;
      const text = extractHudDisplayText(h.props ?? {});
      const unknown = tokenizeWords(text).filter((w) => !isKnownIdWord(w, extraWords));
      if (unknown.length > 0) {
        issues.push({
          severity: h.component === 'KineticTitle' ? 'error' : 'warning',
          message: `TEXT_UNKNOWN_WORD: kata tak dikenal (${unknown.join(', ')}) pada ${h.component} "${hid}"`,
          ref: `${sc.id}:${hid}`,
        });
      }
    });
  }
  return issues;
}
