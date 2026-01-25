# VectoriaDB

[![npm version](https://img.shields.io/npm/v/vectoriadb.svg)](https://www.npmjs.com/package/vectoriadb)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

> A lightweight, production-ready in-memory vector database for semantic search in JavaScript/TypeScript

VectoriaDB is a fast, minimal-dependency vector database designed for in-memory semantic search. Powered by [transformers.js](https://github.com/xenova/transformers.js), it's perfect for applications that need to quickly search through documents, tools, or any text-based data using natural language queries.

## Features

- **Fast**: In-memory storage with optimized HNSW indexing for O(log n) search
- **Lightweight**: Minimal dependencies, small footprint
- **Semantic Search**: Natural language queries using state-of-the-art embeddings
- **Type-Safe**: Full TypeScript support with generics
- **Batch Operations**: Efficient bulk insert and search
- **Flexible Filtering**: Custom metadata filtering with type safety
- **Scalable**: HNSW index for 100k+ documents with sub-millisecond search
- **Persistent**: File & Redis adapters for caching across restarts
- **Smart Updates**: Incremental updates without re-embedding (instant metadata updates)
- **Production-Ready Error Handling**: Typed error classes with specific error codes

## Installation

```bash
npm install vectoriadb
# or
yarn add vectoriadb
# or
pnpm add vectoriadb
```

**Requirements:**

- Node.js 18+ (for transformers.js compatibility)
- TypeScript 5.0+ (if using TypeScript)

## Quick Start

```typescript
import { VectoriaDB } from 'vectoriadb';

// Create and initialize the database
const db = new VectoriaDB();
await db.initialize();

// Add documents
await db.add('doc-1', 'How to create a user account', {
  id: 'doc-1',
  category: 'auth',
  author: 'Alice',
});

await db.add('doc-2', 'Send email notifications to users', {
  id: 'doc-2',
  category: 'notifications',
  author: 'Bob',
});

// Search
const results = await db.search('creating new accounts');
console.log(results[0].metadata); // { id: 'doc-1', category: 'auth', ... }
console.log(results[0].score); // 0.87
```

## Documentation

For full documentation including:

- API Reference
- Advanced Usage (HNSW, persistence, type-safe metadata)
- Error Handling
- Performance Tuning

See the [detailed documentation](./libs/vectoriadb/README.md).

## Development

```bash
# Install dependencies
yarn install

# Run tests
npx nx test vectoriadb

# Build library
npx nx build vectoriadb

# Run demo
npx nx serve vectoriadb-demo
```

## License

Apache-2.0

## Credits

Built with [transformers.js](https://github.com/xenova/transformers.js) by Xenova.
