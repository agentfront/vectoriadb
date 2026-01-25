# Tool Discovery Guide

Index your tools with VectoriaDB for semantic search and intelligent tool recommendations.

This guide shows how to use VectoriaDB for always-on semantic tool discovery in your applications.

## What You'll Build

- A typed document shape for every tool, app, or resource you want to search
- An indexing routine that stays in sync with your tool registry
- Semantic queries with metadata filters, score thresholds, and pagination controls
- Persistent caches (file or Redis) so restarts do not require re-embedding everything
- Tunable HNSW search for large inventories

## Prerequisites

- Node.js 22 or later
- Ability to install npm packages
- Optional: writable disk or Redis for persistence

## Step 1: Install & Initialize VectoriaDB

```bash
npm install vectoriadb
```

Initialize a singleton database during server startup:

```ts
import { VectoriaDB, DocumentMetadata } from 'vectoriadb';

interface ToolDocument extends DocumentMetadata {
  toolName: string;
  owner: string;
  tags: string[];
  risk: 'safe' | 'destructive';
}

export const toolIndex = new VectoriaDB<ToolDocument>({
  cacheDir: './.cache/transformers',
  defaultSimilarityThreshold: 0.4,
});

await toolIndex.initialize(); // downloads and warms the embedding model once
```

`initialize()` must run before `add`, `search`, or `update`. Calling it twice is safe because VectoriaDB short-circuits if it is already ready.

## Step 2: Index Your Tools

Collect metadata from your tool registry and write it into the database. Each document needs a unique `id`, the natural-language `text` you want to vectorize, and `metadata` that extends `DocumentMetadata`.

```ts
interface ToolEntry {
  name: string;
  owner: { id: string };
  metadata: {
    description?: string;
    inputSchema?: Record<string, unknown>;
    tags?: string[];
    annotations?: { destructiveHint?: boolean };
  };
}

function collectToolDocuments(tools: ToolEntry[]): Array<{ id: string; text: string; metadata: ToolDocument }> {
  return tools.map((tool) => {
    const docId = `${tool.owner.id}:${tool.name}`;
    return {
      id: docId,
      text: [
        tool.metadata.description ?? tool.name,
        `Inputs: ${Object.keys(tool.metadata.inputSchema ?? {}).join(', ') || 'none'}`,
        `Tags: ${(tool.metadata.tags ?? []).join(', ') || 'none'}`,
      ].join('\n'),
      metadata: {
        id: docId,
        toolName: tool.name,
        owner: tool.owner.id,
        tags: tool.metadata.tags ?? [],
        risk: tool.metadata.annotations?.destructiveHint ? 'destructive' : 'safe',
      },
    };
  });
}

export async function indexTools(tools: ToolEntry[]) {
  await toolIndex.addMany(collectToolDocuments(tools));
}
```

`addMany` validates every document, enforces `maxBatchSize`, and prevents duplicates.

## Step 3: Run Semantic Search

Query the index anywhere you can run async code:

```ts
const matches = await toolIndex.search('reset a billing password', {
  topK: 5,
  threshold: 0.45,
  filter: (metadata) => metadata.owner === 'billing' && !metadata.tags.includes('deprecated'),
});

for (const match of matches) {
  console.log(`${match.metadata.toolName} (${match.score.toFixed(2)})`);
}
```

`search` returns the best matches sorted by cosine similarity. Use `filter` to enforce authorization, `includeVector` to inspect raw vectors, and `threshold` to drop low-confidence hits.

> **Tip:** Keep the index current with `updateMetadata`, `update`, or `updateMany`. Metadata-only updates never trigger re-embedding, while text changes re-embed only the affected documents.

## Step 4: Persist Embeddings

Avoid re-indexing on every boot by using storage adapters with a deterministic tools hash:

```ts
import { VectoriaDB, FileStorageAdapter, SerializationUtils } from 'vectoriadb';

export async function warmToolIndex(tools: ToolEntry[]) {
  const documents = collectToolDocuments(tools);

  const toolIndex = new VectoriaDB<ToolDocument>({
    storageAdapter: new FileStorageAdapter({
      cacheDir: './.cache/vectoriadb',
      namespace: 'tool-index',
    }),
    toolsHash: SerializationUtils.createToolsHash(documents),
    version: process.env.npm_package_version,
  });

  await toolIndex.initialize();

  if (toolIndex.size() === 0) {
    await toolIndex.addMany(documents);
    await toolIndex.saveToStorage(); // persist embeddings to disk
  }

  return toolIndex;
}
```

`toolsHash` automatically invalidates the cache when your tool list or descriptions change. Call `saveToStorage()` after indexing; `initialize()` transparently loads the cache on the next boot.

> **Note:** Need a shared cache across pods? Swap in `RedisStorageAdapter` with your preferred Redis client and namespace.

## Step 5: Scale & Tune

- Enable `useHNSW` for datasets above roughly ten thousand documents. HNSW provides sub-millisecond queries with more than 95% recall.
- Adjust `threshold` and `topK` per query to trade recall for precision.
- Guard resource usage with `maxDocuments`, `maxDocumentSize`, and `maxBatchSize`.
- Set a custom `cacheDir` if your runtime has strict filesystem policies.

```ts
const toolIndex = new VectoriaDB<ToolDocument>({
  useHNSW: true,
  hnsw: { M: 16, efConstruction: 200, efSearch: 64 },
  maxDocuments: 150_000,
  maxBatchSize: 2_000,
});
```

## Complete Example

```ts
import { VectoriaDB, FileStorageAdapter, SerializationUtils, DocumentMetadata } from 'vectoriadb';

interface ToolDocument extends DocumentMetadata {
  toolName: string;
  owner: string;
  tags: string[];
  risk: 'safe' | 'destructive';
}

// Initialize with persistence
const documents = [
  {
    id: 'users:list',
    text: 'List all users with pagination and filtering',
    metadata: { id: 'users:list', toolName: 'list', owner: 'users', tags: ['read'], risk: 'safe' as const },
  },
  {
    id: 'users:create',
    text: 'Create a new user account with email and password',
    metadata: { id: 'users:create', toolName: 'create', owner: 'users', tags: ['write'], risk: 'safe' as const },
  },
  {
    id: 'billing:charge',
    text: 'Charge a customer payment method',
    metadata: { id: 'billing:charge', toolName: 'charge', owner: 'billing', tags: ['write'], risk: 'destructive' as const },
  },
];

const db = new VectoriaDB<ToolDocument>({
  storageAdapter: new FileStorageAdapter({
    cacheDir: './.cache/vectoriadb',
    namespace: 'tools',
  }),
  toolsHash: SerializationUtils.createToolsHash(documents),
});

await db.initialize();

if (db.size() === 0) {
  await db.addMany(documents);
  await db.saveToStorage();
}

// Search for tools
const results = await db.search('create new account', {
  topK: 3,
  threshold: 0.4,
  filter: (m) => m.risk === 'safe',
});

console.log('Matching tools:');
for (const result of results) {
  console.log(`  ${result.metadata.toolName} (${result.score.toFixed(2)})`);
}
```

## Related

- [Overview](../overview.md) - Getting started
- [Indexing](./indexing.md) - Adding documents
- [Search](./search.md) - Query options
- [Persistence](./persistence.md) - Storage adapters
- [HNSW](./hnsw.md) - Scaling to large datasets
