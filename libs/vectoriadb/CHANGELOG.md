# Changelog

All notable changes to `vectoriadb` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `TFIDFVectoria` indexes words in every script. The tokenizer kept `[A-Za-z0-9_]` only, so words in Hebrew, Arabic,
  Cyrillic, Greek, Chinese or Japanese had no terms, and accented Latin words broke into fragments (`Vögel` was
  `gel`). The default tokenizer keeps letters, marks and digits in any script, folds accents on Latin and Greek letters,
  and splits Chinese, Japanese, Thai, Lao, Khmer and Myanmar into characters and neighbor pairs. ASCII text gives the
  same terms as before.
- `loadSnapshot()` re-indexes a snapshot from its text when it was built with another tokenizer, including every
  snapshot from before this release, instead of restoring vectors that hold the other tokenizer's terms.

### Added

- `TFIDFVectoria` options `tokenizer` and `tokenizerId`, and the exports `defaultTokenizer`, `DEFAULT_TOKENIZER_ID`
  and `Tokenizer`, from `vectoriadb` and `vectoriadb/worker`.
- `TFIDFEmbeddingService` takes a tokenizer in its constructor.
- `TFIDFSnapshot.tokenizer`, the id of the tokenizer that built the snapshot.

## [2.3.0] - 2026-06-18

## [2.1.0] - 2026-01-27

## [2.0.2] - 2026-01-07

### Fixed

- Regex vulnerability detection now trims analyzed patterns to 500 characters and evaluates them through bounded helper regexes to avoid the analyzer triggering ReDoS.
- Redis namespace sanitization bounds the namespace prior to regex processing and swaps in precompiled `SAFE_PATTERNS` to strip control characters and unsafe symbols deterministically.

### Security

- Hardened both the regex analyzer and namespace sanitizer so untrusted input can no longer leverage those code paths for ReDoS attacks.

## [2.0.0] - 2025-12-12

### Added

- Added EmbeddingService.setTransformersModule() and clearTransformersModule() to allow injecting custom transformer pipelines (primarily for testing).

### Changed

- Transformer embeddings now lazy-load @huggingface/transformers and emit a ConfigurationError with installation guidance when the package is not installed.
- @huggingface/transformers is now distributed as an optional peer dependency and must be added explicitly when using transformer embeddings.

## [1.0.0] - 2025-11-30

### Added

- Initial release
- In-memory vector database for semantic search
- Cosine similarity and Euclidean distance metrics
- Namespace support for multi-tenant use cases
- Configurable embedding dimensions
- Efficient nearest neighbor search
