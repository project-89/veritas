import { Injectable, Logger } from '@nestjs/common';
import {
  Document,
  FilterQuery,
  Model,
  UpdateQuery,
  UpdateWithAggregationPipeline,
} from 'mongoose';
import { FindOptions, Repository } from '../interfaces/repository.interface';

/**
 * MongoDB implementation of the Repository interface
 */
@Injectable()
export class MongoDBRepository<T> implements Repository<T> {
  private readonly logger = new Logger(MongoDBRepository.name);

  constructor(private readonly model: Model<T & Document>) {}

  /**
   * Find all entities matching the given filter
   */
  async find(filter: FilterQuery<T> = {}, options?: FindOptions): Promise<T[]> {
    try {
      let query = this.model.find(filter);

      if (options?.skip) {
        query = query.skip(options.skip);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.sort) {
        query = query.sort(options.sort);
      }

      return await query.exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error finding documents: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Find a single entity by its ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      return await this.model.findById(id).exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error finding document by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Find a single entity matching the given filter
   */
  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    try {
      return await this.model.findOne(filter).exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error finding document: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Count entities matching the given filter
   */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error counting documents: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create a new entity
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      const newEntity = new this.model(data);
      return (await newEntity.save()) as T;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error creating document: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create multiple entities
   */
  async createMany(data: Partial<T>[]): Promise<T[]> {
    try {
      return (await this.model.insertMany(data)) as T[];
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error creating multiple documents: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Update an entity by ID
   */
  async updateById(id: string, data: UpdateQuery<T>): Promise<T | null> {
    try {
      return await this.model
        .findByIdAndUpdate(id, data as UpdateQuery<T & Document>, { new: true })
        .exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error updating document by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Update entities matching the given filter
   */
  async updateMany(
    filter: FilterQuery<T>,
    data: UpdateQuery<T>
  ): Promise<number> {
    try {
      const result = await this.model
        .updateMany(filter, data as UpdateWithAggregationPipeline)
        .exec();
      return result.modifiedCount;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error updating documents: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Delete an entity by ID
   */
  async deleteById(id: string): Promise<T | null> {
    try {
      return await this.model.findByIdAndDelete(id).exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error deleting document by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Delete entities matching the given filter
   */
  async deleteMany(filter: FilterQuery<T>): Promise<number> {
    try {
      const result = await this.model.deleteMany(filter).exec();
      return result.deletedCount;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error deleting documents: ${err.message}`, err.stack);
      throw error;
    }
  }
}
