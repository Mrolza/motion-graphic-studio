export const HEDGE_EQUIVALENTS: Record<string, string[]> = {
  most: ['sebagian besar', 'kebanyakan', 'umumnya'],
  about: ['sekitar', 'kurang lebih', 'kira-kira'],
  approximately: ['sekitar', 'kira-kira', 'kurang lebih', 'mendekati'],
  'less chance': [
    'peluang lebih kecil',
    'peluang yang lebih kecil',
    'lebih kecil kemungkinan',
    'kemungkinan lebih kecil',
    'kemungkinan yang lebih kecil',
    'cenderung lebih kecil',
    'mengurangi kemungkinan',
    'mengurangi risiko',
    'lebih jarang',
  ],
  'tend to': ['cenderung'],
  may: ['dapat', 'bisa', 'mungkin'],
  usually: ['biasanya', 'umumnya'],
  often: ['sering', 'sering kali', 'kerap'],
  some: ['beberapa', 'sebagian'],
};

export const ABSOLUTE_TERMS_ID = [
  'tanpa',
  'selalu',
  'tidak pernah',
  'pasti',
  'terus-menerus',
  'terus',
  'semua',
] as const;

const ABSOLUTE_QUOTE_ALLOWLIST: Record<string, string[]> = {
  tanpa: ['without', 'no '],
  selalu: ['always'],
  'tidak pernah': ['never'],
  pasti: ['certainly', 'definitely', 'must'],
  'terus-menerus': ['continuously', 'constantly', 'continuous'],
  terus: ['continuously', 'constantly', 'continuous', 'keep '],
  semua: ['all ', 'every '],
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystackLower: string, term: string): boolean {
  const trimmed = term.trim().toLowerCase();
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(trimmed)}(?:$|[^\\p{L}\\p{N}])`, 'u');
  return pattern.test(haystackLower);
}

export function detectHedgeAndAbsoluteMismatches(
  claimText: string,
  quoteText: string
): {
  hedgeDropped: Array<{ en: string; expectedId: string[] }>;
  absoluteAdded: string[];
} {
  const textLower = claimText.toLowerCase();
  const quoteLower = quoteText.toLowerCase();

  const hedgeDropped: Array<{ en: string; expectedId: string[] }> = [];
  for (const [enTerm, idEquivs] of Object.entries(HEDGE_EQUIVALENTS)) {
    if (containsTerm(quoteLower, enTerm)) {
      // If the quote mentions "less chance of <subject>" (e.g. flanges rubbing/contact),
      // only require the hedge when the text actually discusses that clause (or uses an absolute).
      if (
        enTerm === 'less chance' &&
        !/\b(flens|flange|gesek|bergesekan|bersentuhan|menyentuh|kontak|peluang|kemungkinan|risiko|jarang)\b/i.test(
          textLower
        )
      ) {
        continue;
      }
      const hasMatch = idEquivs.some((eq) => containsTerm(textLower, eq)) || containsTerm(textLower, enTerm);
      if (!hasMatch) {
        hedgeDropped.push({ en: enTerm, expectedId: idEquivs });
      }
    }
  }

  const absoluteAdded: string[] = [];
  for (const absTerm of ABSOLUTE_TERMS_ID) {
    if (containsTerm(textLower, absTerm)) {
      const allowedEn = ABSOLUTE_QUOTE_ALLOWLIST[absTerm] ?? [];
      const quoteHasAbsolute =
        containsTerm(quoteLower, absTerm) ||
        allowedEn.some((en) => quoteLower.includes(en.toLowerCase()));
      if (!quoteHasAbsolute) {
        // Avoid double-reporting "terus" when "terus-menerus" already matched
        if (absTerm === 'terus' && absoluteAdded.includes('terus-menerus')) continue;
        absoluteAdded.push(absTerm);
      }
    }
  }

  return { hedgeDropped, absoluteAdded };
}

export function findAbsoluteTermsId(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const term of ABSOLUTE_TERMS_ID) {
    if (containsTerm(lower, term)) {
      if (term === 'terus' && found.includes('terus-menerus')) continue;
      found.push(term);
    }
  }
  return found;
}

export function findHedgeTermsId(text: string): string[] {
  const lower = text.toLowerCase();
  const allIdHedges = new Set(Object.values(HEDGE_EQUIVALENTS).flat());
  const found: string[] = [];
  for (const h of allIdHedges) {
    if (containsTerm(lower, h)) {
      found.push(h);
    }
  }
  return found;
}
