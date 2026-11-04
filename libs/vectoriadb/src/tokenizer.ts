/**
 * Splits text into the terms a TF-IDF index counts.
 *
 * Index and query text go through the same tokenizer, so a term matches only a term it produced.
 */
export type Tokenizer = (text: string) => string[];

/**
 * The id of {@link defaultTokenizer}. A snapshot records the id of the tokenizer that built it, and a snapshot built
 * by another tokenizer is re-indexed from its text when it is loaded.
 */
export const DEFAULT_TOKENIZER_ID = 'unicode-1';

/** Anything but a letter, a combining mark, a digit or `_`, in any script: what separates terms. */
const SEPARATOR = /[^\p{L}\p{M}\p{N}_]+/u;

/**
 * A combining mark on a Latin or Greek letter, after NFKD: dropped, so `café` and `cafe` are one term. Cyrillic keeps
 * its marks: `й` is a letter of its own, not an accented `и`.
 */
const FOLDABLE_MARK = /([\p{Script=Latin}\p{Script=Greek}])\p{M}+/gu;

/** Chinese characters and the Japanese kana and Thai, Lao, Khmer and Myanmar scripts, written without spaces. */
const UNSPACED =
  '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\u30fc\\p{Script=Thai}\\p{Script=Lao}\\p{Script=Khmer}\\p{Script=Myanmar}';

/** A run of characters from scripts written without spaces, or a run of any other term characters. */
const RUN = new RegExp(`[${UNSPACED}]+|[^${UNSPACED}]+`, 'gu');

const HAS_UNSPACED = new RegExp(`[${UNSPACED}]`, 'u');

const HAN = /\p{Script=Han}/u;

/**
 * The default tokenizer: lowercase terms in any script.
 *
 * - Text is NFKD-normalized and lowercased. Marks on Latin and Greek letters are dropped (`Vögel` is `vogel`), and
 *   other marks are kept, so Cyrillic `й`, and Hebrew, Arabic and Devanagari words, stay as written.
 * - Terms are runs of letters, marks, digits and `_`. Terms of one character are left out, as before.
 * - Scripts written without spaces between words have no word boundaries to split on. A run of Chinese characters
 *   gives each character and each pair of neighbors (`查找狗` is `查`, `找`, `狗`, `查找`, `找狗`). A run of kana or of
 *   Thai, Lao, Khmer or Myanmar gives each pair of neighbors, or the character when the run has one. Pairs work in
 *   every runtime, where a dictionary-based segmenter (`Intl.Segmenter`) splits differently from one ICU version to
 *   another.
 *
 * ASCII text gives the same terms as the tokenizer before 2.3.4.
 */
export function defaultTokenizer(text: string): string[] {
  const folded = text.normalize('NFKD').toLowerCase().replace(FOLDABLE_MARK, '$1').normalize('NFC');
  const terms: string[] = [];
  for (const word of folded.split(SEPARATOR)) {
    if (word.length === 0) continue;
    if (!HAS_UNSPACED.test(word)) {
      if (word.length > 1) terms.push(word);
      continue;
    }
    for (const run of word.match(RUN) ?? []) {
      if (!HAS_UNSPACED.test(run)) {
        if (run.length > 1) terms.push(run);
        continue;
      }
      pushUnspacedTerms(Array.from(run), terms);
    }
  }
  return terms;
}

function pushUnspacedTerms(chars: string[], terms: string[]): void {
  if (chars.length === 1) {
    terms.push(chars[0]);
    return;
  }
  for (let i = 0; i < chars.length; i++) {
    if (HAN.test(chars[i])) terms.push(chars[i]);
    if (i + 1 < chars.length) terms.push(chars[i] + chars[i + 1]);
  }
}
