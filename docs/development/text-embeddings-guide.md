# Text Embeddings and Vector Search in Veritas

This document explains how to use the text embeddings and vector search functionality in the Veritas platform.

## Overview

Text embeddings are vector representations of text that capture semantic meaning, allowing for advanced search capabilities beyond traditional keyword matching. The Veritas platform now supports text embeddings and vector similarity search across content, enabling:

- Semantic similarity search
- Content recommendation
- Topic clustering
- Concept identification
- Narrative linkage detection

## Architecture

The embeddings functionality is implemented through the following components:

1. **EmbeddingsService** - Core service that generates and manages text embeddings
2. **Content Schema** - Enhanced with an embedding field to store vector representations
3. **Repository Interfaces** - Extended with vector search capabilities
4. **ContentService** - Enhanced with embedding generation and semantic search methods

## Configuration

To use embeddings in your application, you need to enable the feature in the `ContentClassificationModule`:

```typescript
// In your application module
imports: [
  ContentClassificationModule.forRoot({
    database: {
      providerType: 'mongodb',
      providerOptions: {
        uri: 'mongodb://localhost:27017',
        databaseName: 'veritas',
      }
    },
    enableEmbeddings: true,
    embeddings: {
      serviceEndpoint: 'https://api.openai.com/v1/embeddings', // Optional external service
      apiKey: 'your-api-key', // If using external service
      dimension: 384 // Default dimension size
    }
  })
]
```

### Environment Variables

Alternatively, you can configure the embeddings service through environment variables:

```
EMBEDDING_SERVICE_ENDPOINT=https://api.openai.com/v1/embeddings
EMBEDDING_SERVICE_API_KEY=your-api-key
EMBEDDING_DIMENSION=384
```

## Using Embeddings

### Generating Embeddings

Embeddings are automatically generated when content is created or updated. You can also generate embeddings for existing content:

```typescript
// Generate embedding for a single content item
const contentWithEmbedding = await contentService.generateEmbedding(contentId);

// Generate embeddings for all content without them
const processedCount = await contentService.generateAllEmbeddings();
```

### Semantic Search

To perform semantic searches that understand the meaning of text rather than just keywords:

```typescript
// Search for content semantically similar to a query
const results = await contentService.semanticSearchContent({
  semanticQuery: 'The impact of climate change on agriculture',
  minScore: 0.7,
  limit: 20
});

// Hybrid search using both keywords and semantic similarity
const hybridResults = await contentService.semanticSearchContent({
  query: 'climate',             // Traditional keyword search
  semanticQuery: 'environmental impact of global warming on food production',
  minScore: 0.7,
  limit: 20
});
```

### Finding Similar Content

To find content similar to an existing piece of content:

```typescript
// Find content similar to a specific content item
const similarContent = await contentService.findSimilarContent(contentId, {
  limit: 10,
  minScore: 0.75,
  useExistingEmbedding: true // Use cached embedding if available
});

// Process the results
similarContent.forEach(({ content, score }) => {
  console.log(`${content.id}: ${score.toFixed(2)} similarity`);
});
```

## Working with Different Database Providers

The vector search implementation adapts to the capabilities of each database provider:

### MongoDB

When using MongoDB, the system will:
- Use MongoDB Atlas Vector Search if available (requires MongoDB Atlas with Vector Search capability)
- Fall back to in-memory search if vector search isn't available

### Memgraph

When using Memgraph, the system will:
- Use Memgraph's vector similarity functions through Cypher queries
- Requires the Graph Data Science plugin to be installed in Memgraph

### Redis

Redis support for vector search is included but requires Redis Stack with RediSearch module.

## Implementation Details

### Database Schemas

The Content schema has been extended with an `embedding` field to store the vector representation:

```typescript
@Prop({ type: [Number], index: false, sparse: true })
embedding?: number[];
```

MongoDB Atlas Vector Search index is created automatically if supported:

```typescript
ContentModel.index(
  { embedding: 'vector' },
  {
    name: 'embedding_vector_index',
    vectorOptions: {
      dimension: 384,
      similarity: 'cosine'
    }
  }
);
```

### External Embedding Services

The EmbeddingsService is designed to work with external embedding services like:

- OpenAI Embeddings API
- Cohere Embed API
- Hugging Face Inference API
- Custom deployed models

The service will fall back to a simplified local implementation if no external service is configured.

## Best Practices

1. **Vector Dimensions**: Keep vector dimensions consistent (default: 384)
2. **Batch Processing**: Use `batchGenerateEmbeddings` for bulk operations
3. **Caching**: Embeddings are cached to improve performance
4. **Hybrid Search**: Combine keyword and semantic search for best results
5. **Minimum Similarity**: Adjust `minScore` based on your use case (0.7 is a good starting point)

## Troubleshooting

- **Missing Embeddings**: If content doesn't have embeddings, use `generateAllEmbeddings()`
- **Slow Queries**: If vector search is slow, check if your database supports vector indices
- **Quality Issues**: External embedding services provide better quality than the local fallback
- **Memory Usage**: Large embedding sets can consume significant memory, especially with in-memory fallback search

## Future Improvements

- Custom embedding models tailored to specific domains
- Real-time embedding updates
- Embedding compression for storage efficiency
- Multi-modal embeddings for images and text
- Concept and entity extraction from embeddings 