# Veritas Database Library

The Veritas Database Library provides a flexible, multi-database architecture designed to efficiently handle different data storage requirements. The library uses an adapter pattern to abstract away the specifics of each database technology, allowing the application to seamlessly work with multiple databases through a consistent interface.

## Features

- **Multiple Database Support**: MongoDB for document storage, Memgraph for graph relationships, and Redis for caching.
- **Unified Repository Pattern**: Consistent CRUD operations across all database types.
- **NestJS Integration**: Built as a NestJS module for seamless integration with the Veritas application.
- **Type-Safe**: Written in TypeScript with full type support.
- **Extensible**: Easy to add new database adapters.

## Architecture

The database library follows a clean architecture with these key components:

- **DatabaseProvider Interface**: The core abstraction that all database adapters implement.
- **Repository Interface**: Provides a consistent API for CRUD operations.
- **Database Service**: Entry point for the application to interact with databases.
- **Adapters**: Implementations for specific database technologies (MongoDB, Memgraph, Redis).

## Installation

```bash
npm install @veritas/database
```

## Usage

### Registering a Database Module

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@veritas/database';

@Module({
  imports: [
    DatabaseModule.register({
      providerType: 'mongodb', // or 'memgraph', 'redis'
      providerOptions: {
        uri: 'mongodb://localhost:27017',
        databaseName: 'veritas',
        username: 'user', // optional
        password: 'pass', // optional
      },
      isGlobal: true, // optional
    }),
  ],
})
export class AppModule {}
```

### Using the Database Service

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@veritas/database';
import { Schema } from 'mongoose';

@Injectable()
export class ContentService {
  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    // Register MongoDB model
    const contentSchema = new Schema({
      text: String,
      author: String,
      // ...
    });
    
    this.databaseService.registerModel('Content', contentSchema);
  }

  async createContent(content: any) {
    const repository = this.databaseService.getRepository<any>('Content');
    return await repository.create(content);
  }

  async findContent(id: string) {
    const repository = this.databaseService.getRepository<any>('Content');
    return await repository.findById(id);
  }
}
```

## Multi-Database Architecture

This library supports using multiple database technologies simultaneously for different purposes:

- **MongoDB**: Use for document storage and complex queries.
- **Memgraph**: Use for graph relationships and network analysis.
- **Redis**: Use for caching and high-speed operations.

To use multiple databases, register multiple DatabaseModules with different provider types:

```typescript
@Module({
  imports: [
    // MongoDB for document storage
    DatabaseModule.register({
      providerType: 'mongodb',
      providerOptions: {
        uri: 'mongodb://localhost:27017',
        databaseName: 'veritas',
      },
      isGlobal: false,
    }),
    
    // Memgraph for graph relationships
    DatabaseModule.register({
      providerType: 'memgraph',
      providerOptions: {
        uri: 'bolt://localhost:7687',
        databaseName: 'veritas',
      },
      isGlobal: false,
    }),
  ],
  providers: [
    {
      provide: 'MONGODB_SERVICE',
      useFactory: (dbService: DatabaseService) => dbService,
      inject: [DatabaseService],
    },
    {
      provide: 'MEMGRAPH_SERVICE',
      useFactory: (dbService: DatabaseService) => dbService,
      inject: [DatabaseService],
    },
  ],
})
export class AppModule {}
```

Then inject the specific database services where needed:

```typescript
@Injectable()
export class AnalysisService {
  constructor(
    @Inject('MONGODB_SERVICE') private readonly mongoDbService: DatabaseService,
    @Inject('MEMGRAPH_SERVICE') private readonly memgraphService: DatabaseService,
  ) {}
  
  // Use each service for its appropriate purpose
}
```

## API Reference

### DatabaseProvider Interface

```typescript
interface DatabaseProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  registerModel(name: string, schema: any): any;
  getRepository<T>(entityName: string): Repository<T>;
}
```

### Repository Interface

```typescript
interface Repository<T> {
  find(filter?: any, options?: FindOptions): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  findOne(filter: any): Promise<T | null>;
  count(filter?: any): Promise<number>;
  create(data: Partial<T>): Promise<T>;
  createMany(data: Partial<T>[]): Promise<T[]>;
  updateById(id: string, data: any): Promise<T | null>;
  updateMany(filter: any, data: any): Promise<number>;
  deleteById(id: string): Promise<T | null>;
  deleteMany(filter: any): Promise<number>;
}
```

### DatabaseService Methods

```typescript
class DatabaseService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getRepository<T>(entityName: string): Repository<T>;
  registerModel(name: string, schema: any): any;
}
```

## Extending

To add a new database adapter, implement the `DatabaseProvider` interface and register it in the `DatabaseModule`.

## License

MIT 