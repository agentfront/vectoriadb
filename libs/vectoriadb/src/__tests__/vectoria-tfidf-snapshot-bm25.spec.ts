import { TFIDFVectoria } from '../vectoria-tfidf';
import type { DocumentMetadata } from '../interfaces';

interface Meta extends DocumentMetadata {
  id: string;
  kind: string;
}

const CORPUS: Array<{ id: string; text: string; metadata: Meta }> = [
  { id: 'auth', text: 'user authentication login session token oauth security', metadata: { id: 'auth', kind: 'security' } },
  { id: 'billing', text: 'invoice payment charge subscription billing refund money', metadata: { id: 'billing', kind: 'finance' } },
  { id: 'profile', text: 'user profile avatar name email account settings', metadata: { id: 'profile', kind: 'user' } },
  { id: 'search', text: 'search query index ranking relevance results documents', metadata: { id: 'search', kind: 'search' } },
  { id: 'notify', text: 'notification email push alert message subscribe', metadata: { id: 'notify', kind: 'messaging' } },
];

function build(scoring: 'cosine' | 'bm25') {
  const db = new TFIDFVectoria<Meta>({ scoring, defaultTopK: 5, defaultSimilarityThreshold: 0 });
  db.addDocuments(CORPUS);
  db.reindex();
  return db;
}

describe('TFIDFVectoria snapshot round-trip', () => {
  for (const scoring of ['cosine', 'bm25'] as const) {
    it(`produces identical search results after toSnapshot/loadSnapshot (${scoring})`, () => {
      const original = build(scoring);
      const queries = ['user authentication', 'payment invoice', 'search ranking', 'email notification'];
      const before = queries.map((q) => original.search(q, { topK: 5 }));

      // Serialize → JSON → parse (proves it is JSON-safe) → restore into a fresh db.
      const snapshot = JSON.parse(JSON.stringify(original.toSnapshot()));
      const restored = new TFIDFVectoria<Meta>();
      restored.loadSnapshot(snapshot);

      const after = queries.map((q) => restored.search(q, { topK: 5 }));

      expect(restored.getDocumentCount()).toBe(original.getDocumentCount());
      for (let i = 0; i < queries.length; i++) {
        expect(after[i].map((r) => r.id)).toEqual(before[i].map((r) => r.id));
        for (let j = 0; j < after[i].length; j++) {
          expect(after[i][j].score).toBeCloseTo(before[i][j].score, 10);
        }
      }
    });
  }

  it('restored index is queryable WITHOUT a reindex (needsReindexing is false)', () => {
    const snapshot = build('bm25').toSnapshot();
    const restored = new TFIDFVectoria<Meta>();
    restored.loadSnapshot(snapshot);
    expect(restored.needsReindexing()).toBe(false);
    expect(restored.search('billing refund', { topK: 1 })[0].id).toBe('billing');
  });

  it('rejects an unsupported snapshot version', () => {
    const restored = new TFIDFVectoria<Meta>();
    expect(() => restored.loadSnapshot({ v: 2 } as never)).toThrow(/snapshot version/i);
  });

  it('toSnapshot reindexes lazily if needed', () => {
    const db = new TFIDFVectoria<Meta>({ scoring: 'bm25' });
    db.addDocuments(CORPUS); // no explicit reindex
    expect(db.needsReindexing()).toBe(true);
    const snapshot = db.toSnapshot();
    expect(snapshot.documents).toHaveLength(CORPUS.length);
    expect(snapshot.documents.every((d) => typeof d.length === 'number')).toBe(true);
  });
});

describe('TFIDFVectoria BM25 scoring', () => {
  it('ranks the on-topic document first', () => {
    const db = build('bm25');
    expect(db.search('authentication token', { topK: 1 })[0].id).toBe('auth');
    expect(db.search('subscription refund', { topK: 1 })[0].id).toBe('billing');
  });

  it('supports negativeQuery demotion in BM25 mode', () => {
    const db = build('bm25');
    // "user" hits both auth and profile; the negative "authentication security"
    // should push auth down (or out) for a plain "user" query. A dropped-out
    // doc (filtered below threshold) is the strongest demotion → rank Infinity.
    const rank = (arr: { id: string }[], id: string) => {
      const i = arr.findIndex((r) => r.id === id);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    };
    const plain = db.search('user', { topK: 5 });
    const demoted = db.search('user', { topK: 5, negativeQuery: 'authentication security token', negativeWeight: 2 });
    expect(rank(demoted, 'auth')).toBeGreaterThanOrEqual(rank(plain, 'auth'));
    // profile (no negative terms) should still be present.
    expect(rank(demoted, 'profile')).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  it('cosine remains the default scoring mode', () => {
    const db = new TFIDFVectoria<Meta>();
    db.addDocuments(CORPUS);
    db.reindex();
    const snap = db.toSnapshot();
    expect(snap.scoring).toBe('cosine');
    // cosine scores are bounded ~[0,1]
    const top = db.search('user authentication', { topK: 1 })[0];
    expect(top.score).toBeLessThanOrEqual(1.0001);
  });
});

describe('TFIDFVectoria.loadSnapshot — deserialization hardening', () => {
  it('strips __proto__/constructor/prototype keys from snapshot metadata', () => {
    const original = build('bm25');
    const snapshot = JSON.parse(JSON.stringify(original.toSnapshot()));
    // Inject a hostile metadata payload into the persisted snapshot (simulating a
    // tampered KV/Redis cache) via JSON.parse so the dangerous keys are OWN keys.
    snapshot.documents[0].metadata = JSON.parse(
      '{"id":"auth","kind":"security","__proto__":{"polluted":true},"constructor":{"x":1}}',
    );

    const restored = new TFIDFVectoria<Meta>();
    restored.loadSnapshot(snapshot);

    // Object.prototype must not be polluted, and the dangerous own-keys must be gone.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const auth = restored.search('user authentication', { topK: 5 }).find((r) => r.id === 'auth');
    expect(auth).toBeDefined();
    expect(Object.keys(auth!.metadata as object)).not.toContain('__proto__');
    expect(Object.keys(auth!.metadata as object)).not.toContain('constructor');
    expect((auth!.metadata as Meta).kind).toBe('security');
  });

  it('rejects a snapshot whose documents are not an array', () => {
    const snapshot = JSON.parse(JSON.stringify(build('bm25').toSnapshot()));
    snapshot.documents = { not: 'an array' };
    expect(() => new TFIDFVectoria<Meta>().loadSnapshot(snapshot)).toThrow(/documents must be an array/);
  });

  it('rejects a snapshot with a non-finite avgDocLength', () => {
    const snapshot = JSON.parse(JSON.stringify(build('bm25').toSnapshot()));
    snapshot.avgDocLength = 'NaN-ish';
    expect(() => new TFIDFVectoria<Meta>().loadSnapshot(snapshot)).toThrow(/avgDocLength/);
  });
});
