# Error Handling

Production-ready error handling with typed error classes.

All errors extend `VectoriaError` and ship with machine-readable `code` values so you can branch on them.

## Error Types

| Error                         | Code                        | Description                |
| ----------------------------- | --------------------------- | -------------------------- |
| `VectoriaNotInitializedError` | `NOT_INITIALIZED`           | Call `initialize()` first  |
| `DocumentValidationError`     | `DOCUMENT_VALIDATION_ERROR` | Invalid document data      |
| `DocumentNotFoundError`       | `DOCUMENT_NOT_FOUND`        | Document ID doesn't exist  |
| `DocumentExistsError`         | `DOCUMENT_EXISTS`           | Document ID already exists |
| `DuplicateDocumentError`      | `DUPLICATE_DOCUMENT`        | Duplicate in batch         |
| `QueryValidationError`        | `QUERY_VALIDATION_ERROR`    | Invalid search query       |
| `EmbeddingError`              | `EMBEDDING_ERROR`           | Model embedding failed     |
| `StorageError`                | `STORAGE_ERROR`             | Storage operation failed   |
| `ConfigurationError`          | `CONFIGURATION_ERROR`       | Invalid config             |

## Importing Error Classes

```ts
import {
  VectoriaError,
  VectoriaNotInitializedError,
  DocumentValidationError,
  DocumentNotFoundError,
  DocumentExistsError,
  DuplicateDocumentError,
  QueryValidationError,
  EmbeddingError,
  StorageError,
  ConfigurationError,
} from 'vectoriadb';
```

## Error Handling Patterns

### Catch Specific Errors

```ts
try {
  await toolIndex.add(doc.id, doc.text, doc.metadata);
} catch (error) {
  if (error instanceof VectoriaNotInitializedError) {
    await toolIndex.initialize();
  } else if (error instanceof DocumentValidationError) {
    console.warn({ tool: error.documentId }, 'invalid document skipped');
  } else if (error instanceof VectoriaError) {
    console.error({ code: error.code }, error.message);
    throw error;
  } else {
    throw error;
  }
}
```

### Catch by Error Code

```ts
try {
  const results = await toolIndex.search(query);
} catch (error) {
  if (error instanceof VectoriaError) {
    switch (error.code) {
      case 'NOT_INITIALIZED':
        await toolIndex.initialize();
        return toolIndex.search(query);
      case 'QUERY_VALIDATION_ERROR':
        console.error('Invalid query:', error.message);
        return [];
      default:
        throw error;
    }
  }
  throw error;
}
```

### Batch Operations with Error Recovery

```ts
async function addDocumentsSafely(documents: Array<{ id: string; text: string; metadata: T }>) {
  try {
    await db.addMany(documents);
  } catch (error) {
    if (error instanceof DuplicateDocumentError) {
      // Remove duplicate and retry
      const uniqueDocs = documents.filter((doc) => doc.id !== error.documentId);
      await db.addMany(uniqueDocs);
      console.warn(`Skipped duplicate: ${error.documentId}`);
    } else if (error instanceof DocumentValidationError) {
      // Log validation error and continue with valid documents
      console.error(`Invalid document ${error.documentId}:`, error.message);
      const validDocs = documents.filter((doc) => doc.id !== error.documentId);
      await db.addMany(validDocs);
    } else {
      throw error; // Unexpected error
    }
  }
}
```

### Graceful Degradation

```ts
async function searchWithFallback(query: string) {
  try {
    return await db.search(query);
  } catch (error) {
    if (error instanceof QueryValidationError) {
      // Fallback to default search
      console.warn('Invalid query, using default search');
      return await db.search('default query', { threshold: 0.1 });
    } else if (error instanceof VectoriaNotInitializedError) {
      // Initialize and retry
      await db.initialize();
      return await db.search(query);
    }
    throw error;
  }
}
```

## Monitoring and Health

Use `getStats()` to feed dashboards or health endpoints:

```ts
const stats = toolIndex.getStats();
/*
{
  totalEmbeddings: number;
  dimensions: number;
  estimatedMemoryBytes: number;
  modelName: string;
}
*/
```

Pair stats with `toolIndex.size()`, `toolIndex.clear()`, and `toolIndex.clearStorage()` to expose maintenance commands or admin tooling.

## Best Practices

1. **Always catch specific errors** instead of generic `Error`
2. **Use error codes** for programmatic handling
3. **Access error properties** (`documentId`, `context`, etc.) for debugging
4. **Implement retry logic** for `VectoriaNotInitializedError`
5. **Log validation errors** with context for debugging
6. **Graceful fallbacks** for production resilience

## Related

- [Overview](../overview.md) - Getting started
- [Indexing](../guides/indexing.md) - Adding documents
- [Search](../guides/search.md) - Querying the index
