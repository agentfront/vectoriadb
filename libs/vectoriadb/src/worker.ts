/**
 * WORKER-SAFE ENTRY — `vectoriadb/worker`.
 *
 * Exposes ONLY the zero-dependency TF-IDF / BM25 vector database. It pulls in NO
 * Node built-ins and NO ML runtime (`transformers.js`, `node:fs`, Redis) — the
 * heavy bits behind the default barrel. That makes it safe to bundle for V8
 * isolates (Cloudflare Workers, Deno, Bun) without relying on the bundler's
 * tree-shaking to drop the ML/storage adapters.
 *
 * Supports snapshot persistence (`toSnapshot`/`loadSnapshot`) for fast cold
 * starts and `scoring: 'bm25'` for stronger keyword relevance.
 */
export { TFIDFVectoria } from './vectoria-tfidf';
export type {
  TFIDFDocument,
  TFIDFVectoriaConfig,
  TFIDFScoring,
  BM25Params,
  TFIDFSnapshot,
} from './vectoria-tfidf';
export { TFIDFEmbeddingService } from './tfidf.embedding.service';
export type { DocumentMetadata, SearchOptions, SearchResult, FilterFunction } from './interfaces';
