# Changelog

All notable changes to the Veritas project will be documented in this file.

## [Unreleased]

### Added
- Enhanced build script for the ingestion module
- New transform-on-ingest service for social media processing

### Changed
- Consolidated content-related functionality from `@veritas/content-classification` into `@veritas/content-classification`
- Added `ContentService` and `ContentValidationService` to `@veritas/content-classification`
- Updated the content-classification module to support dependency injection for database services

### Deprecated
- `@veritas/content-classification` module is now deprecated and will be removed in a future release
- Use `@veritas/content-classification` instead for all content-related functionality

## [0.1.0] - 2023-03-31
- Initial repository setup with core modules 