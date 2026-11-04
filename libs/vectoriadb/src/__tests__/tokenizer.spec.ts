import { TFIDFVectoria, type TFIDFSnapshot } from '../vectoria-tfidf';
import { DEFAULT_TOKENIZER_ID, defaultTokenizer } from '../tokenizer';

/** The tokenizer before 2.3.4, which kept `[A-Za-z0-9_]` only. */
const asciiTokenizer = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1);

describe('defaultTokenizer', () => {
  it.each([
    'User authentication tool',
    'deploy the server to cloudflare-workers, then run `npm test`!',
    'get_user_by_id(42) returns {id, name}',
    'HTTP/2 + TLS1.3 => 200 OK; x y z',
    '  leading   and trailing  \t\n whitespace ',
    'a b c single letters are dropped',
    'snake_case_name and CamelCaseName v2.3.4',
  ])('gives ASCII text the same terms as before: %s', (text) => {
    expect(defaultTokenizer(text)).toEqual(asciiTokenizer(text));
  });

  it.each([
    ['Hebrew', 'מציאת כלבים, חתולים וציפורים.', ['מציאת', 'כלבים', 'חתולים', 'וציפורים']],
    ['Arabic', 'البحث عن القطط', ['البحث', 'عن', 'القطط']],
    ['Russian', 'Найти кошек и собак', ['найти', 'кошек', 'собак']],
    ['Greek', 'Βρες γάτες', ['βρες', 'γατες']],
    ['Hindi', 'बिल्ली खोजें', ['बिल्ली', 'खोजें']],
    ['Korean', '고양이 찾기', ['고양이', '찾기']],
  ])('keeps whole %s words', (_script, text, terms) => {
    expect(defaultTokenizer(text)).toEqual(terms);
  });

  it.each([
    ['Vögel', ['vogel']],
    ['café crème brûlée', ['cafe', 'creme', 'brulee']],
    ['ÉCOLE', ['ecole']],
    ['Ёлка и йод', ['ёлка', 'йод']],
    ['ﬁle ｃａｔｓ', ['file', 'cats']],
  ])('folds case, accents and compatibility forms: %s', (text, terms) => {
    expect(defaultTokenizer(text)).toEqual(terms);
  });

  it('splits Chinese into characters and neighbor pairs', () => {
    expect(defaultTokenizer('查找狗')).toEqual(['查', '查找', '找', '找狗', '狗']);
    expect(defaultTokenizer('猫')).toEqual(['猫']);
  });

  it('splits Japanese kana and Thai into neighbor pairs', () => {
    expect(defaultTokenizer('ねこ')).toEqual(['ねこ']);
    expect(defaultTokenizer('ネコ')).toEqual(['ネコ']);
    expect(defaultTokenizer('แมว')).toEqual(['แม', 'มว']);
  });

  it('splits a word that mixes scripts at the script change', () => {
    expect(defaultTokenizer('iPhone手机')).toEqual(['iphone', '手', '手机', '机']);
  });

  it('leaves punctuation of every script out', () => {
    expect(defaultTokenizer('猫、狗。«chats» ¿perros?')).toEqual(['猫', '狗', 'chats', 'perros']);
  });
});

describe('TFIDFVectoria with the default tokenizer', () => {
  const catalog = (): TFIDFVectoria<{ id: string }> => {
    const db = new TFIDFVectoria<{ id: string }>({ defaultTopK: 5, defaultSimilarityThreshold: 0.01 });
    db.addDocuments([
      { id: 'pet-catalog', text: 'Pet catalog. Find dogs, cats and birds.', metadata: { id: 'pet-catalog' } },
      { id: 'katalog', text: 'Katalog. Hunde, Katzen und Vögel finden.', metadata: { id: 'katalog' } },
      { id: 'katalog-he', text: 'קטלוג. מציאת כלבים, חתולים וציפורים.', metadata: { id: 'katalog-he' } },
      { id: 'mulu', text: '目录。查找狗、猫和鸟。', metadata: { id: 'mulu' } },
      { id: 'store', text: 'Store. Count the pets in stock, and read an order.', metadata: { id: 'store' } },
    ]);
    db.reindex();
    return db;
  };
  const ids = (results: Array<{ id: string }>): string[] => results.map((r) => r.id);

  it('finds a document by a word in its own script', () => {
    const db = catalog();
    expect(ids(db.search('חתולים'))).toEqual(['katalog-he']);
    expect(ids(db.search('猫'))).toEqual(['mulu']);
    expect(ids(db.search('Katzen'))).toEqual(['katalog']);
  });

  it('ranks every document a query in two scripts matches', () => {
    expect(ids(catalog().search('חתולים cats')).sort()).toEqual(['katalog-he', 'pet-catalog']);
  });

  it('matches a word with or without its accent', () => {
    expect(ids(catalog().search('Vogel'))).toEqual(['katalog']);
  });

  it('does not match one word by a fragment of another', () => {
    expect(catalog().search('Nägel schneiden')).toEqual([]);
  });
});

describe('the tokenizer option', () => {
  const stopWords = new Set(['the', 'me', 'show']);
  const withoutStopWords = (text: string): string[] => defaultTokenizer(text).filter((term) => !stopWords.has(term));

  it('tokenizes documents and queries with the given tokenizer', () => {
    const db = new TFIDFVectoria<{ id: string }>({ tokenizer: withoutStopWords, defaultSimilarityThreshold: 0.01 });
    db.addDocument('pets', 'Find dogs, cats and birds.', { id: 'pets' });
    db.addDocument('store', 'Count the pets in stock.', { id: 'store' });
    db.reindex();

    expect(db.search('show me the cats').map((r) => r.id)).toEqual(['pets']);
  });

  it('leaves out anything a tokenizer returns that is not a non-empty string', () => {
    const db = new TFIDFVectoria<{ id: string }>({
      tokenizer: (text) => [...defaultTokenizer(text), '', undefined as unknown as string],
      defaultSimilarityThreshold: 0.01,
    });
    db.addDocument('pets', 'Find cats.', { id: 'pets' });
    db.addDocument('store', 'Count stock.', { id: 'store' });
    db.reindex();

    expect(db.search('cats').map((r) => r.id)).toEqual(['pets']);
  });
});

describe('snapshots and the tokenizer', () => {
  const build = (config: ConstructorParameters<typeof TFIDFVectoria>[0] = {}): TFIDFVectoria<{ id: string }> => {
    const db = new TFIDFVectoria<{ id: string }>({ defaultSimilarityThreshold: 0.01, ...config });
    db.addDocument('katalog-he', 'מציאת כלבים, חתולים וציפורים.', { id: 'katalog-he' });
    db.addDocument('pet-catalog', 'Find dogs, cats and birds.', { id: 'pet-catalog' });
    db.reindex();
    return db;
  };

  it('records the id of the default tokenizer', () => {
    expect(build().toSnapshot().tokenizer).toBe(DEFAULT_TOKENIZER_ID);
  });

  it('restores the stored vectors of a snapshot built by the same tokenizer', () => {
    const snapshot = build().toSnapshot();
    const restored = new TFIDFVectoria<{ id: string }>({ defaultSimilarityThreshold: 0.01 });
    restored.loadSnapshot(snapshot);

    expect(restored.getStats().needsReindex).toBe(false);
    expect(restored.toSnapshot()).toEqual(snapshot);
    expect(restored.search('חתולים').map((r) => r.id)).toEqual(['katalog-he']);
  });

  it('re-indexes a snapshot from before 2.3.4, whose vectors hold ASCII terms only, from its text', () => {
    const snapshot = build().toSnapshot();
    const legacy: TFIDFSnapshot<{ id: string }> = {
      ...snapshot,
      tokenizer: undefined,
      model: { idf: [['cats', 0.69]], df: [['cats', 1]], documentCount: 2 },
      documents: snapshot.documents.map((d) => ({ ...d, vector: d.id === 'pet-catalog' ? [['cats', 0.1]] : [] })),
    };
    delete legacy.tokenizer;
    const restored = new TFIDFVectoria<{ id: string }>({ defaultSimilarityThreshold: 0.01 });
    restored.loadSnapshot(legacy);

    expect(restored.search('חתולים').map((r) => r.id)).toEqual(['katalog-he']);
    expect(restored.toSnapshot().tokenizer).toBe(DEFAULT_TOKENIZER_ID);
  });

  it('re-indexes a snapshot built by another tokenizer', () => {
    const snapshot = build({ tokenizer: (text) => text.split(/\s+/), tokenizerId: 'whitespace' }).toSnapshot();
    expect(snapshot.tokenizer).toBe('whitespace');

    const restored = new TFIDFVectoria<{ id: string }>({ defaultSimilarityThreshold: 0.01 });
    restored.loadSnapshot(snapshot);

    expect(restored.search('cats').map((r) => r.id)).toEqual(['pet-catalog']);
  });

  it('always re-indexes the snapshot of a custom tokenizer without an id', () => {
    const tokenizer = (text: string) => defaultTokenizer(text).filter((term) => term !== 'cats');
    const snapshot = build({ tokenizer }).toSnapshot();
    expect(snapshot.tokenizer).toBeUndefined();

    const restored = new TFIDFVectoria<{ id: string }>({ tokenizer, defaultSimilarityThreshold: 0.01 });
    restored.loadSnapshot(snapshot);

    expect(restored.search('dogs').map((r) => r.id)).toEqual(['pet-catalog']);
    expect(restored.search('cats')).toEqual([]);
  });

  it('refuses a snapshot whose tokenizer id is not a string', () => {
    const snapshot = { ...build().toSnapshot(), tokenizer: 7 } as unknown as TFIDFSnapshot<{ id: string }>;
    expect(() => new TFIDFVectoria().loadSnapshot(snapshot)).toThrow('tokenizer must be a string');
  });
});
