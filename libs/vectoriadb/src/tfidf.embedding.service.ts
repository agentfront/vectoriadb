/**
 * Lightweight TF-IDF based embedding service for semantic search
 *
 * This provides a simple, synchronous alternative to the ML-based EmbeddingService
 * Ideal for use cases where:
 * - You don't want to download ML models
 * - You need synchronous operation
 * - You have a small to medium corpus (< 10K documents)
 * - You want zero external dependencies beyond Node.js
 *
 * Note: For production semantic search with larger corpora, use the ML-based
 * EmbeddingService which provides better quality embeddings via transformers.js
 */
export class TFIDFEmbeddingService {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private documentCount = 0;

  /**
   * Tokenizes and normalizes text into terms
   */
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 1); // Filter out single characters
  }

  /**
   * Computes term frequency for a document
   */
  private computeTermFrequency(terms: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    const totalTerms = terms.length;

    // Handle empty document edge case
    if (totalTerms === 0) {
      return tf;
    }

    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }

    // Normalize by document length
    for (const [term, count] of tf.entries()) {
      tf.set(term, count / totalTerms);
    }

    return tf;
  }

  /**
   * Updates the IDF (Inverse Document Frequency) values
   * This should be called whenever documents are added to the corpus
   */
  updateIDF(documents: string[][]): void {
    this.documentCount = documents.length;
    const documentFrequency = new Map<string, number>();

    // Count how many documents contain each term
    for (const terms of documents) {
      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      }
    }

    // Retain df so BM25 scoring (a separate, smoothed IDF) can be computed
    // without recounting, and so it survives snapshot/restore.
    this.documentFrequency = documentFrequency;

    // Compute IDF: log(N / df). Reset first so removed terms don't linger.
    this.idf.clear();
    for (const [term, df] of documentFrequency.entries()) {
      this.idf.set(term, Math.log(this.documentCount / df));
    }

    // Build vocabulary
    this.vocabulary.clear();
    let index = 0;
    for (const term of this.idf.keys()) {
      if (!this.vocabulary.has(term)) {
        this.vocabulary.set(term, index++);
      }
    }
  }

  /**
   * BM25 inverse document frequency for a term: a smoothed, probabilistic IDF
   * that (unlike the plain `log(N/df)` used for the cosine path) never collapses
   * to a useless value as df grows and is the standard relevance weight for the
   * Okapi BM25 ranking function.
   *
   * `log(1 + (N - df + 0.5) / (df + 0.5))`
   */
  bm25Idf(term: string): number {
    const df = this.documentFrequency.get(term) ?? 0;
    if (df === 0) return 0;
    return Math.log(1 + (this.documentCount - df + 0.5) / (df + 0.5));
  }

  /**
   * Serialize the learned model (IDF + document frequencies + corpus size). The
   * vocabulary is intentionally NOT serialized — it is rebuilt deterministically
   * from the IDF keys on import (it only matters for `toDenseVector`, never for
   * sparse cosine/BM25 search), which keeps snapshots smaller.
   */
  exportState(): { idf: Array<[string, number]>; df: Array<[string, number]>; documentCount: number } {
    return {
      idf: Array.from(this.idf.entries()),
      df: Array.from(this.documentFrequency.entries()),
      documentCount: this.documentCount,
    };
  }

  /**
   * Restore a model previously produced by {@link exportState}. Rebuilds the
   * vocabulary index from the IDF term order.
   */
  importState(state: { idf: Array<[string, number]>; df: Array<[string, number]>; documentCount: number }): void {
    // `state` is deserialized (possibly cached/attacker-influenced) data —
    // validate the entry shapes before trusting them so a malformed snapshot
    // fails loudly instead of producing a corrupt index or NaN-poisoned scores.
    if (!Array.isArray(state.idf) || !Array.isArray(state.df)) {
      throw new Error('Invalid TFIDF model state: idf and df must be arrays of [term, number] pairs');
    }
    if (!Number.isFinite(state.documentCount) || state.documentCount < 0) {
      throw new Error('Invalid TFIDF model state: documentCount must be a non-negative number');
    }
    // Validate each entry so a malformed snapshot can't seed the Maps with
    // missing terms or NaN/Infinity weights that would poison later scores.
    const assertPairs = (pairs: Array<[string, number]>, field: string): void => {
      for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !Number.isFinite(pair[1])) {
          throw new Error(`Invalid TFIDF model state: ${field} entries must be [string, finite number] pairs`);
        }
      }
    };
    assertPairs(state.idf, 'idf');
    assertPairs(state.df, 'df');
    this.idf = new Map(state.idf);
    this.documentFrequency = new Map(state.df);
    this.documentCount = state.documentCount;
    this.vocabulary.clear();
    let index = 0;
    for (const term of this.idf.keys()) {
      this.vocabulary.set(term, index++);
    }
  }

  /**
   * Generates a TF-IDF vector for a given text
   * Returns a sparse vector representation as a Map<term, weight>
   */
  embed(text: string): Map<string, number> {
    const terms = this.tokenize(text);
    const tf = this.computeTermFrequency(terms);
    const vector = new Map<string, number>();

    for (const [term, tfValue] of tf.entries()) {
      const idfValue = this.idf.get(term) || 0;
      if (idfValue > 0) {
        vector.set(term, tfValue * idfValue);
      }
    }

    return vector;
  }

  /**
   * Converts a sparse vector to a dense Float32Array
   * Uses the internal vocabulary for dimension mapping
   * Missing terms are filled with zeros
   */
  toDenseVector(sparseVector: Map<string, number>): Float32Array {
    const dimensions = this.vocabulary.size;
    const dense = new Float32Array(dimensions);

    for (const [term, weight] of sparseVector.entries()) {
      const index = this.vocabulary.get(term);
      if (index !== undefined) {
        dense[index] = weight;
      }
    }

    return dense;
  }

  /**
   * Computes cosine similarity between two sparse vectors
   * More efficient than converting to dense vectors for TF-IDF
   */
  cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number {
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    // Compute dot product and magnitude of vector1
    for (const [term, value] of vector1.entries()) {
      magnitude1 += value * value;
      const value2 = vector2.get(term) || 0;
      dotProduct += value * value2;
    }

    // Compute magnitude of vector2
    for (const value of vector2.values()) {
      magnitude2 += value * value;
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Get the size of the vocabulary
   */
  getVocabularySize(): number {
    return this.vocabulary.size;
  }

  /**
   * Get the number of documents in the corpus
   */
  getDocumentCount(): number {
    return this.documentCount;
  }

  /**
   * Clear the IDF and vocabulary (useful for rebuilding the index)
   */
  clear(): void {
    this.vocabulary.clear();
    this.idf.clear();
    this.documentFrequency.clear();
    this.documentCount = 0;
  }
}
