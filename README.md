# VectoriaDB

[![npm version](https://img.shields.io/npm/v/vectoriadb.svg)](https://www.npmjs.com/package/vectoriadb)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

> Lightweight, in-memory vector database for semantic search in JavaScript/TypeScript

## Features

- **Fast** - HNSW indexing for O(log n) search on 100k+ documents
- **Lightweight** - Minimal dependencies, small footprint
- **Type-Safe** - Full TypeScript support with generics
- **Flexible** - Custom metadata filtering with batch operations
- **Persistent** - File & Redis adapters for caching across restarts
- **Zero-Dep Option** - TF-IDF mode for simpler deployments

## Installation

```bash
npm install vectoriadb
```

Requires Node.js 18+.

## Quick Start

```typescript
import { VectoriaDB } from 'vectoriadb';

const db = new VectoriaDB();
await db.initialize();

// Add documents with metadata
await db.add('doc-1', 'How to create a user account', { category: 'auth' });
await db.add('doc-2', 'Send email notifications', { category: 'notifications' });

// Semantic search
const results = await db.search('creating new accounts');
console.log(results[0].score); // 0.87
```

## Documentation

| Topic | Link |
|-------|------|
| Get Started | [Welcome](https://agentfront.dev/docs/vectoriadb/get-started/welcome) |
| Installation | [Setup Guide](https://agentfront.dev/docs/vectoriadb/get-started/installation) |
| Quickstart | [First Steps](https://agentfront.dev/docs/vectoriadb/get-started/quickstart) |
| Indexing | [Core Guide](https://agentfront.dev/docs/vectoriadb/guides/core/indexing-basics) |
| Search | [Search Guide](https://agentfront.dev/docs/vectoriadb/guides/search/basic-search) |
| Storage | [Persistence](https://agentfront.dev/docs/vectoriadb/guides/storage/overview) |
| Scaling | [HNSW Overview](https://agentfront.dev/docs/vectoriadb/guides/scaling/hnsw-overview) |
| TF-IDF | [Alternative](https://agentfront.dev/docs/vectoriadb/guides/alternatives/tfidf) |
| Production | [Deployment](https://agentfront.dev/docs/vectoriadb/deployment/production-config) |
| API Reference | [Full API](https://agentfront.dev/docs/vectoriadb/api-reference/overview) |

## Development

```bash
yarn install          # Install dependencies
npx nx test vectoriadb    # Run tests
npx nx build vectoriadb   # Build library
```

## License

Apache-2.0

---

Built with [transformers.js](https://github.com/xenova/transformers.js) by Xenova.
