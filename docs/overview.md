# VectoriaDB Overview

Lightweight in-memory vector database for semantic search with offline embeddings.

VectoriaDB is a production-ready in-memory vector database built on transformers.js. Use it to surface the right tool, prompt, or document snippet from natural-language queries without shipping data to an external service.

## Features

- **Offline Embeddings** - Embeddings run locally via transformers.js, so your data never leaves the server and you avoid API quotas.
- **Type-safe Metadata** - Strong generics ensure every document you index keeps the same shape as your metadata interface.
- **Operational Guardrails** - Built-in rate limits, batch validation, HNSW indexing, and storage adapters keep the index production ready.

## When to Use VectoriaDB

- **Tool discovery** - Surface the right tool from natural-language queries
- **Document search** - Semantic search over documents, prompts, or code snippets
- **Recommendation systems** - Find similar items based on text embeddings
- **Offline-first applications** - No external API dependencies

> **Note:** The default Xenova `all-MiniLM-L6-v2` model is ~22 MB. The first initialization downloads and caches it under `cacheDir`; subsequent boots reuse the local copy.

## Installation

```bash
npm install vectoriadb
```

## Quick Start

```ts
import { VectoriaDB, DocumentMetadata } from 'vectoriadb';

interface ToolDocument extends DocumentMetadata {
  toolName: string;
  owner: string;
  tags: string[];
  risk: 'safe' | 'destructive';
}

const toolIndex = new VectoriaDB<ToolDocument>({
  cacheDir: './.cache/transformers',
  defaultSimilarityThreshold: 0.4,
});

await toolIndex.initialize(); // downloads and warms the embedding model once

// Add a document
await toolIndex.add('users:list', 'List all users with pagination', {
  id: 'users:list',
  toolName: 'list',
  owner: 'users',
  tags: ['read'],
  risk: 'safe',
});

// Search
const results = await toolIndex.search('find users');
console.log(results[0].metadata.toolName); // 'list'
```

`initialize()` must run before `add`, `search`, or `update`. Calling it twice is safe because VectoriaDB short-circuits if it is already ready.

## Core Concepts

### Documents

Each document has:
- **id** - Unique identifier
- **text** - Natural language text to embed
- **metadata** - Type-safe custom data

### Embeddings

VectoriaDB generates embeddings locally using transformers.js. The default model is `all-MiniLM-L6-v2` which provides good quality with fast inference.

### Similarity Search

Search returns documents ranked by cosine similarity to your query. You can filter results by metadata and set minimum similarity thresholds.

## Configuration Options

| Option                       | Type    | Default                     | Description                    |
| ---------------------------- | ------- | --------------------------- | ------------------------------ |
| `modelName`                  | string  | `'Xenova/all-MiniLM-L6-v2'` | Embedding model to use         |
| `cacheDir`                   | string  | `'./.cache/transformers'`   | Model cache directory          |
| `dimensions`                 | number  | Auto-detected               | Vector dimensions              |
| `defaultSimilarityThreshold` | number  | `0.3`                       | Minimum similarity score       |
| `defaultTopK`                | number  | `10`                        | Default results limit          |
| `useHNSW`                    | boolean | `false`                     | Enable HNSW index              |
| `maxDocuments`               | number  | `100000`                    | Max documents (DoS protection) |
| `maxDocumentSize`            | number  | `1000000`                   | Max document size in chars     |
| `maxBatchSize`               | number  | `1000`                      | Max batch operation size       |
| `verboseErrors`              | boolean | `true`                      | Enable detailed errors         |

## Related Documentation

- [Indexing](./guides/indexing.md) - Adding and updating documents
- [Search](./guides/search.md) - Querying the index
- [Persistence](./guides/persistence.md) - Storage adapters
- [HNSW](./guides/hnsw.md) - Scaling to large datasets
- [TF-IDF](./guides/tfidf.md) - Zero-dependency alternative
