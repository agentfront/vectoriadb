import { TFIDFEmbeddingService } from './tfidf.embedding.service';
import type { DocumentMetadata, SearchOptions, SearchResult } from './interfaces';
import { sanitizeObject } from './storage/serialization.utils';

/**
 * Document with TF-IDF sparse vector representation
 */
export interface TFIDFDocument<T extends DocumentMetadata = DocumentMetadata> {
  /**
   * Unique identifier for this document
   */
  id: string;

  /**
   * Sparse TF-IDF vector representation
   */
  vector: Map<string, number>;

  /**
   * Associated metadata
   */
  metadata: T;

  /**
   * Original text used to generate the embedding
   */
  text: string;

  /**
   * Timestamp when this document was created
   */
  createdAt: Date;

  /**
   * Raw (un-normalized) term counts for the document. Only populated when the
   * index is built with `scoring: 'bm25'` — BM25 ranks on raw term frequencies
   * and document length rather than the cosine path's normalized TF-IDF vector.
   */
  termCounts?: Map<string, number>;

  /**
   * Token count (document length) — used by BM25's length normalization.
   */
  length?: number;
}

/**
 * Ranking function used by {@link TFIDFVectoria.search}.
 * - `cosine` (default): cosine similarity over normalized TF-IDF vectors.
 *   Backward-compatible; scores are bounded in roughly [0, 1].
 * - `bm25`: Okapi BM25 — term-saturating, length-normalized relevance scoring.
 *   Generally better keyword relevance; scores are unbounded (sum of weights).
 */
export type TFIDFScoring = 'cosine' | 'bm25';

/**
 * BM25 tuning parameters.
 */
export interface BM25Params {
  /**
   * Term-frequency saturation. Higher = TF matters more before saturating.
   * @default 1.5
   */
  k1?: number;
  /**
   * Length normalization strength (0 = none, 1 = full).
   * @default 0.75
   */
  b?: number;
}

/**
 * Configuration for TF-IDF based VectoriaDB
 */
export interface TFIDFVectoriaConfig {
  /**
   * Default similarity threshold for search results
   * @default 0.0
   */
  defaultSimilarityThreshold?: number;

  /**
   * Maximum number of results to return by default
   * @default 10
   */
  defaultTopK?: number;

  /**
   * Ranking function. Defaults to `cosine` for backward compatibility.
   * @default 'cosine'
   */
  scoring?: TFIDFScoring;

  /**
   * BM25 tuning (only used when `scoring: 'bm25'`).
   */
  bm25?: BM25Params;
}

/**
 * Serialized form of a {@link TFIDFVectoria} index — everything needed to
 * answer queries WITHOUT re-tokenizing or recomputing IDF. Produced by
 * {@link TFIDFVectoria.toSnapshot} and restored by
 * {@link TFIDFVectoria.loadSnapshot}. JSON-safe (Maps become entry arrays,
 * dates become ISO strings) so it can live in KV / Redis / a file.
 */
export interface TFIDFSnapshot<T extends DocumentMetadata = DocumentMetadata> {
  /** Snapshot schema version. */
  v: 1;
  scoring: TFIDFScoring;
  bm25: Required<BM25Params>;
  config: Required<Pick<TFIDFVectoriaConfig, 'defaultSimilarityThreshold' | 'defaultTopK'>>;
  /** Corpus average document length (BM25). */
  avgDocLength: number;
  model: { idf: Array<[string, number]>; df: Array<[string, number]>; documentCount: number };
  documents: Array<{
    id: string;
    text: string;
    metadata: T;
    createdAt: string;
    vector: Array<[string, number]>;
    termCounts?: Array<[string, number]>;
    length?: number;
  }>;
}

/**
 * Lightweight TF-IDF based vector database
 *
 * A synchronous, zero-dependency alternative to the ML-based VectoriaDB
 * Perfect for:
 * - Small to medium corpora (< 10K documents)
 * - Scenarios where ML model downloads are not acceptable
 * - Use cases requiring synchronous operation
 * - Keyword/term-based semantic search
 *
 * Limitations compared to ML-based VectoriaDB:
 * - Less semantic understanding (synonyms, context)
 * - Better for exact term matching
 * - Requires reindexing when corpus changes
 *
 * @example
 * ```ts
 * const db = new TFIDFVectoria<{ appId: string }>();
 *
 * // Add documents
 * db.addDocument('tool1', 'User authentication tool', { appId: 'auth', id: 'tool1' });
 * db.addDocument('tool2', 'User profile retrieval', { appId: 'user', id: 'tool2' });
 *
 * // Reindex after adding documents
 * db.reindex();
 *
 * // Search
 * const results = db.search('authentication', { topK: 5 });
 * ```
 */
export class TFIDFVectoria<T extends DocumentMetadata = DocumentMetadata> {
  private documents: Map<string, TFIDFDocument<T>>;
  private embeddingService: TFIDFEmbeddingService;
  private config: Required<Omit<TFIDFVectoriaConfig, 'bm25'>>;
  private bm25: Required<BM25Params>;
  private avgDocLength = 0;
  private needsReindex = false;

  constructor(config: TFIDFVectoriaConfig = {}) {
    this.documents = new Map();
    this.embeddingService = new TFIDFEmbeddingService();

    this.config = {
      defaultSimilarityThreshold: config.defaultSimilarityThreshold ?? 0.0,
      defaultTopK: config.defaultTopK ?? 10,
      scoring: config.scoring ?? 'cosine',
    };
    this.bm25 = {
      k1: config.bm25?.k1 ?? 1.5,
      b: config.bm25?.b ?? 0.75,
    };
  }

  /**
   * Add a document to the database
   * Note: You must call reindex() after adding documents for the IDF to be updated
   */
  addDocument(id: string, text: string, metadata: T): void {
    this.documents.set(id, {
      id,
      vector: new Map(), // Will be computed during reindex
      metadata,
      text,
      createdAt: new Date(),
    });

    this.needsReindex = true;
  }

  /**
   * Add multiple documents in batch
   * Note: You must call reindex() after adding documents for the IDF to be updated
   */
  addDocuments(documents: Array<{ id: string; text: string; metadata: T }>): void {
    for (const doc of documents) {
      this.documents.set(doc.id, {
        id: doc.id,
        vector: new Map(),
        metadata: doc.metadata,
        text: doc.text,
        createdAt: new Date(),
      });
    }

    this.needsReindex = true;
  }

  /**
   * Remove a document from the database
   * Note: You must call reindex() after removing documents for the IDF to be updated
   */
  removeDocument(id: string): boolean {
    const deleted = this.documents.delete(id);
    if (deleted) {
      this.needsReindex = true;
    }
    return deleted;
  }

  /**
   * Get a document by ID
   */
  getDocument(id: string): TFIDFDocument<T> | undefined {
    return this.documents.get(id);
  }

  /**
   * Check if a document exists
   */
  hasDocument(id: string): boolean {
    return this.documents.has(id);
  }

  /**
   * Get all document IDs
   */
  getAllDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Get total number of documents
   */
  getDocumentCount(): number {
    return this.documents.size;
  }

  /**
   * Rebuild the IDF values and embeddings for all documents
   * Must be called after adding/removing documents
   */
  reindex(): void {
    if (!this.needsReindex) return;

    const documentTexts: string[][] = [];
    const entries = Array.from(this.documents.values());

    // Tokenize all documents
    for (const entry of entries) {
      documentTexts.push(this.embeddingService.tokenize(entry.text));
    }

    // Update IDF values
    this.embeddingService.updateIDF(documentTexts);

    // Recompute vectors for all documents (cosine path). For BM25 we ALSO keep
    // raw term counts + document length and the corpus average length.
    const wantBm25 = this.config.scoring === 'bm25';
    let totalLength = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      entry.vector = this.embeddingService.embed(entry.text);
      if (wantBm25) {
        const tokens = documentTexts[i];
        const counts = new Map<string, number>();
        for (const term of tokens) counts.set(term, (counts.get(term) ?? 0) + 1);
        entry.termCounts = counts;
        entry.length = tokens.length;
        totalLength += tokens.length;
      } else {
        entry.termCounts = undefined;
        entry.length = undefined;
      }
    }
    this.avgDocLength = wantBm25 && entries.length > 0 ? totalLength / entries.length : 0;

    this.needsReindex = false;
  }

  /**
   * Check if reindexing is needed
   */
  needsReindexing(): boolean {
    return this.needsReindex;
  }

  /**
   * Search for documents matching the query
   */
  search(query: string, options: SearchOptions<T> = {}): SearchResult<T>[] {
    const {
      topK = this.config.defaultTopK,
      threshold = this.config.defaultSimilarityThreshold,
      filter,
      negativeQuery,
      negativeWeight = 1,
    } = options;

    // Fail fast on invalid inputs rather than producing incorrect rankings.
    // (threshold is intentionally only checked for finiteness — BM25 scores are
    // unbounded, so a threshold > 1 is legitimate.)
    if (!query || !query.trim()) {
      throw new Error('Search query cannot be empty or whitespace-only');
    }
    if (!Number.isFinite(topK) || topK <= 0) {
      throw new Error('topK must be a positive number');
    }
    if (!Number.isFinite(negativeWeight) || negativeWeight < 0) {
      throw new Error('negativeWeight must be a non-negative number');
    }
    if (!Number.isFinite(threshold)) {
      throw new Error('threshold must be a finite number');
    }

    // Reindex if needed (before embedding so query + negatives share the vocabulary).
    if (this.needsReindex) {
      this.reindex();
    }

    const bm25 = this.config.scoring === 'bm25';

    // Generate query vector + any anti-query vectors (cosine path only).
    const queryVector = bm25 ? null : this.embeddingService.embed(query);
    const queryTerms = bm25 ? this.embeddingService.tokenize(query) : [];
    const negativeVectors = bm25 ? [] : this.embedNegatives(negativeQuery);
    const negativeTermSets = bm25 ? this.tokenizeNegatives(negativeQuery) : [];

    const results: SearchResult<T>[] = [];

    // Compute (negative-adjusted) score for each document.
    for (const doc of this.documents.values()) {
      // Apply metadata filter if provided
      if (filter && !filter(doc.metadata)) {
        continue;
      }

      let score: number;
      if (bm25) {
        score = this.bm25Score(queryTerms, doc);
        if (negativeTermSets.length > 0) {
          let maxNeg = 0;
          for (const negTerms of negativeTermSets) {
            maxNeg = Math.max(maxNeg, this.bm25Score(negTerms, doc));
          }
          score -= negativeWeight * maxNeg;
        }
      } else {
        score = this.embeddingService.cosineSimilarity(queryVector as Map<string, number>, doc.vector);
        if (negativeVectors.length > 0) {
          let maxNeg = 0;
          for (const nv of negativeVectors) {
            maxNeg = Math.max(maxNeg, this.embeddingService.cosineSimilarity(nv, doc.vector));
          }
          score -= negativeWeight * maxNeg;
        }
      }

      if (score >= threshold) {
        results.push({
          id: doc.id,
          metadata: doc.metadata,
          score,
          text: doc.text,
        });
      }
    }

    // Sort by score (descending) and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Okapi BM25 score of a document for the given (already-tokenized) query terms.
   * Requires the index to have been built with `scoring: 'bm25'` (so raw term
   * counts + document length are present).
   */
  private bm25Score(queryTerms: string[], doc: TFIDFDocument<T>): number {
    const counts = doc.termCounts;
    if (!counts || !doc.length) return 0;
    const { k1, b } = this.bm25;
    const lenNorm = this.avgDocLength > 0 ? doc.length / this.avgDocLength : 1;
    let score = 0;
    // De-duplicate query terms so a repeated query term doesn't double count.
    const seen = new Set<string>();
    for (const term of queryTerms) {
      if (seen.has(term)) continue;
      seen.add(term);
      const tf = counts.get(term);
      if (!tf) continue;
      const idf = this.embeddingService.bm25Idf(term);
      if (idf <= 0) continue;
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * lenNorm)));
    }
    return score;
  }

  /** Tokenize anti-query term(s) for the BM25 path. */
  private tokenizeNegatives(negativeQuery: string | string[] | undefined): string[][] {
    if (negativeQuery == null) return [];
    const terms = Array.isArray(negativeQuery) ? negativeQuery : [negativeQuery];
    return terms
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .map((t) => this.embeddingService.tokenize(t));
  }

  /** Embed the anti-query term(s) (string or array; blanks ignored). TF-IDF vectors are sparse `Map`s. */
  private embedNegatives(negativeQuery: string | string[] | undefined): Map<string, number>[] {
    if (negativeQuery == null) return [];
    const terms = Array.isArray(negativeQuery) ? negativeQuery : [negativeQuery];
    return terms.filter((t) => typeof t === 'string' && t.trim().length > 0).map((t) => this.embeddingService.embed(t));
  }

  /**
   * Serialize the fully-built index into a JSON-safe snapshot. Reindexes first
   * if needed so the snapshot is always queryable on restore.
   *
   * Use this to persist an index (e.g. to Cloudflare KV / Redis / a file) so a
   * cold start can {@link loadSnapshot} instead of re-tokenizing and recomputing
   * IDF for the whole corpus.
   */
  toSnapshot(): TFIDFSnapshot<T> {
    if (this.needsReindex) this.reindex();
    return {
      v: 1,
      scoring: this.config.scoring,
      bm25: { ...this.bm25 },
      config: {
        defaultSimilarityThreshold: this.config.defaultSimilarityThreshold,
        defaultTopK: this.config.defaultTopK,
      },
      avgDocLength: this.avgDocLength,
      model: this.embeddingService.exportState(),
      documents: Array.from(this.documents.values()).map((doc) => ({
        id: doc.id,
        text: doc.text,
        metadata: doc.metadata,
        createdAt: doc.createdAt.toISOString(),
        vector: Array.from(doc.vector.entries()),
        ...(doc.termCounts ? { termCounts: Array.from(doc.termCounts.entries()) } : {}),
        ...(doc.length !== undefined ? { length: doc.length } : {}),
      })),
    };
  }

  /**
   * Restore an index from a {@link toSnapshot} result. Replaces all current
   * state. After this the instance is immediately queryable — no reindex.
   *
   * @throws if the snapshot version is unsupported.
   */
  loadSnapshot(snapshot: TFIDFSnapshot<T>): void {
    if (snapshot.v !== 1) {
      throw new Error(`Unsupported TFIDF snapshot version: ${(snapshot as { v: unknown }).v}`);
    }
    // A snapshot is DESERIALIZED, possibly-attacker-influenced data (e.g. loaded
    // from a KV/Redis cache on a worker). Validate shape and sanitize any
    // free-form `metadata` so a `__proto__`/`constructor`/`prototype` own-key
    // surviving `JSON.parse` can never be forwarded to a prototype-pollution
    // sink downstream (defense-in-depth — consistent with the file/redis adapter
    // path which already runs `sanitizeObject`).
    if (!Array.isArray(snapshot.documents)) {
      throw new Error('Invalid TFIDF snapshot: documents must be an array');
    }
    if (!Number.isFinite(snapshot.avgDocLength) || snapshot.avgDocLength < 0) {
      throw new Error('Invalid TFIDF snapshot: avgDocLength must be a non-negative number');
    }
    // Validate scoring/BM25/config before adopting them so a tampered snapshot
    // can't inject non-finite or out-of-range params that would destabilize
    // (or NaN-poison) downstream scoring.
    if (snapshot.scoring !== 'cosine' && snapshot.scoring !== 'bm25') {
      throw new Error('Invalid TFIDF snapshot: scoring must be "cosine" or "bm25"');
    }
    const { k1, b } = snapshot.bm25 ?? {};
    if (!Number.isFinite(k1) || k1 <= 0) {
      throw new Error('Invalid TFIDF snapshot: bm25.k1 must be a positive number');
    }
    if (!Number.isFinite(b) || b < 0 || b > 1) {
      throw new Error('Invalid TFIDF snapshot: bm25.b must be a number in [0, 1]');
    }
    const cfg = snapshot.config ?? {};
    if (!Number.isFinite(cfg.defaultTopK) || cfg.defaultTopK <= 0) {
      throw new Error('Invalid TFIDF snapshot: config.defaultTopK must be a positive number');
    }
    if (!Number.isFinite(cfg.defaultSimilarityThreshold)) {
      throw new Error('Invalid TFIDF snapshot: config.defaultSimilarityThreshold must be a finite number');
    }
    this.config = {
      defaultSimilarityThreshold: snapshot.config.defaultSimilarityThreshold,
      defaultTopK: snapshot.config.defaultTopK,
      scoring: snapshot.scoring,
    };
    this.bm25 = { k1, b };
    this.avgDocLength = snapshot.avgDocLength;
    this.embeddingService.importState(snapshot.model);

    this.documents = new Map();
    for (const d of snapshot.documents) {
      this.documents.set(d.id, {
        id: d.id,
        text: d.text,
        metadata: sanitizeObject(d.metadata) as T,
        createdAt: new Date(d.createdAt),
        vector: new Map(d.vector),
        ...(d.termCounts ? { termCounts: new Map(d.termCounts) } : {}),
        ...(d.length !== undefined ? { length: d.length } : {}),
      });
    }
    this.needsReindex = false;
  }

  /**
   * Clear all documents and reset the index
   */
  clear(): void {
    this.documents.clear();
    this.embeddingService.clear();
    this.avgDocLength = 0;
    this.needsReindex = false;
  }

  /**
   * Get statistics about the database
   */
  getStats(): {
    documentCount: number;
    vocabularySize: number;
    needsReindex: boolean;
  } {
    return {
      documentCount: this.documents.size,
      vocabularySize: this.embeddingService.getVocabularySize(),
      needsReindex: this.needsReindex,
    };
  }
}
