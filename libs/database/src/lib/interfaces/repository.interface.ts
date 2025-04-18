/**
 * Options for finding multiple entities
 */
export interface FindOptions {
  /** Number of results to skip */
  skip?: number;
  /** Maximum number of results to return */
  limit?: number;
  /** Sort order for results */
  sort?: Record<string, 1 | -1>;
}

/**
 * Options for vector search operations
 */
export interface VectorSearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minScore?: number;
}

/**
 * Result of a vector search operation
 */
export interface VectorSearchResult<T> {
  /** The matched item */
  item: T;
  /** Similarity score (0-1) */
  score: number;
}

/**
 * Generic repository interface for CRUD operations
 */
export interface Repository<T> {
  /**
   * Find all entities matching the given filter
   * @param filter Filter criteria
   * @param options Options for pagination and sorting
   * @returns Array of entities
   */
  find(filter?: any, options?: FindOptions): Promise<T[]>;

  /**
   * Find a single entity by its ID
   * @param id The entity ID
   * @returns The entity or null if not found
   */
  findById(id: string): Promise<T | null>;

  /**
   * Find a single entity matching the given filter
   * @param filter Filter criteria
   * @returns The first matching entity or null if none found
   */
  findOne(filter: any): Promise<T | null>;

  /**
   * Count entities matching the given filter
   * @param filter Filter criteria
   * @returns The count of matching entities
   */
  count(filter?: any): Promise<number>;

  /**
   * Create a new entity
   * @param data The entity data
   * @returns The created entity
   */
  create(data: Partial<T>): Promise<T>;

  /**
   * Create multiple entities
   * @param data Array of entity data
   * @returns Array of created entities
   */
  createMany(data: Partial<T>[]): Promise<T[]>;

  /**
   * Update an entity by ID
   * @param id The entity ID
   * @param data The update data
   * @returns The updated entity or null if not found
   */
  updateById(id: string, data: any): Promise<T | null>;

  /**
   * Update entities matching the given filter
   * @param filter Filter criteria
   * @param data The update data
   * @returns The number of updated entities
   */
  updateMany(filter: any, data: any): Promise<number>;

  /**
   * Delete an entity by ID
   * @param id The entity ID
   * @returns The deleted entity or null if not found
   */
  deleteById(id: string): Promise<T | null>;

  /**
   * Delete entities matching the given filter
   * @param filter Filter criteria
   * @returns The number of deleted entities
   */
  deleteMany(filter: any): Promise<number>;

  /**
   * Perform vector similarity search
   * This is optional and may not be implemented by all repositories
   * @param field The field containing the vector to search against
   * @param vector The query vector
   * @param options Options for the vector search
   * @returns Array of search results with similarity scores
   */
  vectorSearch?<R = T>(
    field: string,
    vector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult<R>[]>;
}
