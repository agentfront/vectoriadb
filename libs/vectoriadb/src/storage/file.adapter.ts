import * as path from 'path';
import type { DocumentMetadata } from '../interfaces';
import type { StorageAdapterConfig, StoredData } from './adapter.interface';
import { BaseStorageAdapter } from './base.adapter';
import { ConfigurationError, StorageError } from '../errors';

/**
 * Configuration for file storage adapter
 */
export interface FileStorageConfig extends StorageAdapterConfig {
  /**
   * Directory to store cache files
   * @default './.cache/vectoriadb'
   */
  cacheDir?: string;

  /**
   * File name for the cache
   * @default 'embeddings.json'
   */
  fileName?: string;
}

/**
 * File-based storage adapter
 * Stores embeddings in a JSON file with hash-based invalidation
 * Perfect for local development to avoid recalculating embeddings
 */
export class FileStorageAdapter<T extends DocumentMetadata = DocumentMetadata> extends BaseStorageAdapter<T> {
  // Cached `fs/promises` module. Loaded lazily (see `getFs`) so that importing
  // the package root does not force browser/worker bundlers to resolve
  // `node:fs`. This is a Node-only adapter; `path` stays a static import because
  // it is pure JS, tree-shakeable, and needed synchronously in the constructor.
  private static _fs: typeof import('fs/promises') | null = null;

  private fileConfig: Required<Pick<FileStorageConfig, 'cacheDir' | 'fileName'>>;
  private filePath: string;

  /**
   * Lazily import `fs/promises`. Keeping this off the top-level import graph
   * means importing the package root never forces a bundler to statically
   * resolve `node:fs`; the module is only loaded when this Node-only adapter is
   * actually used. The adapter throws naturally if `fs` is unavailable at runtime.
   */
  private async getFs(): Promise<typeof import('fs/promises')> {
    if (FileStorageAdapter._fs) {
      return FileStorageAdapter._fs;
    }
    const mod = await import('fs/promises');
    FileStorageAdapter._fs = mod;
    return mod;
  }

  constructor(config: FileStorageConfig = {}) {
    super(config);

    // Sanitize namespace to prevent path traversal
    const sanitizedNamespace = this.sanitizeNamespace(this.config.namespace);

    this.fileConfig = {
      cacheDir: config.cacheDir ?? './.cache/vectoriadb',
      fileName: config.fileName ?? 'embeddings.json',
    };

    this.filePath = path.join(this.fileConfig.cacheDir, sanitizedNamespace, this.fileConfig.fileName);

    // Verify the resolved path is still within cacheDir (path traversal protection)
    this.validateFilePath();
  }

  /**
   * Sanitize namespace to prevent path traversal attacks
   * Removes dangerous characters and path traversal sequences
   */
  private sanitizeNamespace(namespace: string): string {
    return (
      namespace
        // Remove path traversal sequences
        .replace(/\.\./g, '')
        // Replace path separators with hyphens
        .replace(/[/\\]/g, '-')
        // Remove leading dots and hyphens
        .replace(/^[.-]+/, '')
        // Remove trailing dots and hyphens
        .replace(/[.-]+$/, '')
        // Remove any remaining dangerous characters
        .replace(/[^a-zA-Z0-9-_]/g, '')
        // Limit length
        .substring(0, 100) || 'default'
    );
  }

  /**
   * Validate that the file path doesn't escape the cache directory
   */
  private validateFilePath(): void {
    const resolvedPath = path.resolve(this.filePath);
    const resolvedCacheDir = path.resolve(this.fileConfig.cacheDir);

    if (!resolvedPath.startsWith(resolvedCacheDir + path.sep) && resolvedPath !== resolvedCacheDir) {
      throw new ConfigurationError(
        `Invalid namespace: path traversal detected. ` + `Resolved path must be within cache directory.`,
      );
    }
  }

  override async initialize(): Promise<void> {
    // Ensure cache directory exists
    const fs = await this.getFs();
    const dir = path.dirname(this.filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // With recursive:true, EEXIST shouldn't occur in modern Node.js
      // Surface real errors like permission denials or disk full
      throw new StorageError(
        `Failed to create cache directory: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  override async load(): Promise<StoredData<T> | null> {
    try {
      const fs = await this.getFs();
      const content = await fs.readFile(this.filePath, 'utf-8');
      return this.safeJsonParse<StoredData<T>>(content);
    } catch {
      // File doesn't exist or is invalid
      return null;
    }
  }

  override async save(data: StoredData<T>): Promise<void> {
    try {
      const content = this.safeJsonStringify(data, true);
      if (!content) {
        throw new StorageError('Failed to serialize embeddings data');
      }
      const fs = await this.getFs();
      await fs.writeFile(this.filePath, content, 'utf-8');
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to save embeddings to file: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  override async clear(): Promise<void> {
    try {
      const fs = await this.getFs();
      await fs.unlink(this.filePath);
    } catch {
      // File doesn't exist, ignore
    }
  }

  override async close(): Promise<void> {
    // No cleanup needed for file adapter
  }
}
