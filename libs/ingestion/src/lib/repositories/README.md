# NarrativeRepository Implementations

The NarrativeRepository pattern is a core architectural component in Veritas that provides a consistent interface for storing, retrieving, and analyzing narrative insights. The repository pattern abstracts away the specific database implementation, allowing you to swap databases without affecting the business logic.

## Available Implementations

### 1. InMemoryNarrativeRepository

The `InMemoryNarrativeRepository` is the default implementation used for development and testing. It stores all data in memory and provides fast access for development environments. This implementation is automatically used when no specific repository type is configured.

**Advantages:**
- Zero setup required - works out of the box
- Fast performance for development
- No database dependencies

**Limitations:**
- Data is not persisted between server restarts
- Limited scalability - not suitable for large datasets
- No distributed capabilities

### 2. MongoNarrativeRepository

The `MongoNarrativeRepository` is the production-ready implementation that uses MongoDB for persistent storage. This implementation leverages MongoDB's powerful indexing and aggregation capabilities to efficiently store and query narrative insights at scale.

**Advantages:**
- Persistent storage between restarts
- Excellent scalability for large datasets
- Built-in aggregation for trend analysis
- Supports distributed deployment

**Configuration:**
To use the MongoDB implementation, configure the NarrativeModule with the MongoDB repository type:

```typescript
@Module({
  imports: [
    NarrativeModule.forRoot({
      repositoryType: 'mongodb'
    })
  ]
})
export class AppModule {}
```

You'll also need to set the MongoDB connection string in your environment variables:

```
MONGODB_URI=mongodb://localhost:27017/veritas
```

## Schema Design

Both implementations follow the same data model defined by the `NarrativeInsight` and `NarrativeTrend` interfaces. The MongoDB implementation includes additional indexes optimized for common query patterns:

- Content hash indexing for efficient lookups
- Timeframe indexing for temporal queries
- Theme indexing for narrative analysis
- Platform indexing for source distribution analysis

## Adding New Implementations

To add a new implementation:

1. Create a new class that implements the `NarrativeRepository` abstract class
2. Implement all required methods
3. Update the `NarrativeModule.forRoot()` method to support your new implementation
4. Add the necessary configuration options

## Best Practices

- Always access data through the repository abstraction rather than directly
- Use batch operations when possible (e.g., `saveMany` instead of multiple `save` calls)
- Leverage the repository's aggregation capabilities for analytics rather than implementing your own
- Configure the appropriate repository type for your environment (memory for development, MongoDB for production)

## MongoDB Implementation Details

The `MongoNarrativeRepository` implementation offers several additional features beyond the basic repository contract:

### Optimized Queries

The MongoDB implementation includes optimized queries for common access patterns:

- Content hash lookups are indexed for fast duplicate detection
- Timeframe queries use compound indexes for efficient filtering
- Theme-based lookups leverage MongoDB's text indexing capabilities
- Platform-based analysis uses dedicated indexes

### Trend Caching

The implementation stores pre-computed narrative trends in a separate collection:

```typescript
// Trends are cached in the narrative_trends collection
const existingTrends = await this.trendModel.find({ timeframe }).lean();

if (existingTrends.length > 0) {
  return existingTrends;
}
```

This approach provides:
- Faster trend lookups for commonly queried timeframes
- Reduced computation overhead for repeated queries
- Consistent trend analysis results

### Batch Operations

For high-throughput scenarios, the MongoDB implementation optimizes batch operations:

```typescript
// Batch insert/update with bulkWrite
const operations = insights.map(insight => ({
  updateOne: {
    filter: { contentHash: insight.contentHash },
    update: insight,
    upsert: true
  }
}));

await this.insightModel.bulkWrite(operations);
```

This provides:
- Better performance for batch processing
- Reduced network overhead
- Atomic operations where possible

### Schema Design

The MongoDB implementation uses Mongoose schemas:

- `NarrativeInsightSchema` - For storing individual narrative insights
- `NarrativeTrendSchema` - For storing pre-computed trends

Each schema includes optimized indexes for common query patterns and enforces data validation rules to maintain data integrity.

## Monitoring and Performance

When using the MongoDB implementation, you can monitor repository performance:

1. **Query Performance**: Use the MongoDB profiler to identify slow queries
2. **Index Usage**: Check index usage statistics to ensure indexes are being used effectively
3. **Cache Hit Rate**: Monitor the trend cache hit rate to optimize caching strategies
4. **Connection Pool**: Configure the MongoDB connection pool based on your workload

## Docker Configuration

A Docker Compose configuration for MongoDB is included to simplify development and testing:

```bash
# Start MongoDB containers
npm run mongodb:up

# Stop MongoDB containers
npm run mongodb:down
```

This provides:
- MongoDB server running on port 27017
- MongoDB Express admin interface on port 8081
- Persistent volume for data storage 