import { normalizeAuthor, normalizePublisher, normalizeTitle } from './normalize';

// pg_trgm ile aynı mantıkta trigram benzerliği: istemci ve sunucu aynı puanı üretsin.
function trigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (const word of text.split(' ')) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) {
      set.add(padded.slice(i, i + 3));
    }
  }
  return set;
}

export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Kelime sırasından bağımsız benzerlik: "Dostoyevski Fyodor" ≈ "Fyodor Dostoyevski". */
export function tokenSetSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const sa = new Set(a.split(' ').filter(Boolean));
  const sb = new Set(b.split(' ').filter(Boolean));
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  const smaller = Math.min(sa.size, sb.size);
  const larger = Math.max(sa.size, sb.size);
  if (smaller === 0) return 0;
  // Yalnızca küçük kümeye bakmak tek kelimeyi ("Ceza") her başlığa eşler; büyüğü de hesaba kat.
  return (shared / smaller + shared / larger) / 2;
}

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.max(trigramSimilarity(a, b), tokenSetSimilarity(a, b) * 0.95);
}

/** Yazar listelerinin en iyi eşleşen ikilisinin puanı. */
function authorSimilarity(query: string, candidates: string[]): number {
  const q = normalizeAuthor(query);
  if (!q) return 0;
  let best = 0;
  for (const c of candidates) {
    const n = normalizeAuthor(c);
    // Soyadı eşleşmesi tek başına güçlü sinyal: "Dostoyevski" ↔ "Fyodor Dostoyevski".
    const qLast = q.split(' ').pop()!;
    const nLast = n.split(' ').pop()!;
    const lastName = trigramSimilarity(qLast, nLast);
    best = Math.max(best, textSimilarity(q, n), lastName * 0.9);
  }
  return best;
}

export interface MatchQuery {
  title: string;
  author?: string | null;
  publisher?: string | null;
}

export interface MatchCandidate {
  title: string;
  authors: string[];
  publisher?: string | null;
}

/**
 * Model çıktısı ile katalogdaki bir kitap arasındaki 0–1 eşleşme puanı.
 * Başlık ağırlıklı; yazar ve yayınevi destekleyici sinyal.
 */
export function matchScore(query: MatchQuery, candidate: MatchCandidate): number {
  const title = textSimilarity(normalizeTitle(query.title), normalizeTitle(candidate.title));
  const hasAuthor = !!query.author && candidate.authors.length > 0;
  const author = hasAuthor ? authorSimilarity(query.author!, candidate.authors) : 0;

  let score = hasAuthor ? title * 0.7 + author * 0.3 : title * 0.9;

  const qp = normalizePublisher(query.publisher);
  const cp = normalizePublisher(candidate.publisher);
  if (qp && cp && (qp === cp || trigramSimilarity(qp, cp) > 0.6)) {
    score = Math.min(1, score + 0.05);
  }
  return Math.round(score * 1000) / 1000;
}

// Eşikler Faz 0 test setiyle ayarlanacak; tek yerde dursun diye burada.
export const MATCH_THRESHOLDS = {
  matched: 0.8,
  verify: 0.5,
  /** "Eşleşti" demek için en iyi aday ikinciden en az bu kadar önde olmalı. */
  margin: 0.08,
} as const;

export type MatchGroup = 'matched' | 'verify' | 'not_found';

export function classifyMatch(scores: number[]): MatchGroup {
  const sorted = [...scores].sort((a, b) => b - a);
  const best = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  if (best >= MATCH_THRESHOLDS.matched && best - second >= MATCH_THRESHOLDS.margin) return 'matched';
  if (best >= MATCH_THRESHOLDS.verify) return 'verify';
  return 'not_found';
}
