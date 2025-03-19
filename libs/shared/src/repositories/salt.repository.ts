import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Interface representing a cryptographic salt
 */
export interface CryptographicSalt {
  id: string; // Unique identifier for the salt
  purpose: string; // Purpose of the salt ("source", "correlation", "content")
  platform: string; // Platform the salt is used for
  value: string; // The actual salt value
  effectiveFrom: Date; // When this salt became active
  expiresAt?: Date; // When this salt will expire
  status: 'active' | 'expired' | 'deprecated'; // Current status
  createdAt: Date; // When this salt was created
  updatedAt: Date; // When this salt was last updated
}

/**
 * Salt purpose types
 */
export type SaltPurpose = 'source' | 'correlation' | 'content';

/**
 * Manages storage and rotation of cryptographic salts
 */
@Injectable()
export class SaltRepository {
  private readonly logger = new Logger(SaltRepository.name);

  // In-memory salt cache (in production, these would be stored in a database)
  private salts: Map<string, CryptographicSalt> = new Map();

  constructor() {
    // Initialize salts on startup
    this.initializeSalts();
  }

  /**
   * Get the current salt for a specific purpose and platform
   *
   * @param purpose - Purpose of the salt
   * @param platform - Platform identifier
   * @returns Current salt value
   */
  public getCurrentSalt(purpose: SaltPurpose, platform: string): string {
    const key = this.getSaltKey(purpose, platform);
    const salt = this.salts.get(key);

    if (!salt) {
      this.logger.warn(
        `Salt not found for ${purpose}/${platform}. Creating new salt.`
      );
      return this.createNewSalt(purpose, platform).value;
    }

    if (salt.status !== 'active') {
      this.logger.warn(
        `Salt for ${purpose}/${platform} is not active. Creating new salt.`
      );
      return this.createNewSalt(purpose, platform).value;
    }

    return salt.value;
  }

  /**
   * Rotate all salts
   */
  public rotateSalts(): void {
    this.logger.log('Rotating all salts...');

    const purposes: SaltPurpose[] = ['source', 'correlation', 'content'];
    const platforms = this.getUniquePlatforms();

    // Create new salts for each purpose and platform
    for (const purpose of purposes) {
      for (const platform of platforms) {
        this.createNewSalt(purpose, platform);
      }
    }

    this.logger.log(`Rotated salts for ${platforms.length} platforms`);
  }

  /**
   * Get all active salts
   *
   * @returns Array of active salts
   */
  public getAllActiveSalts(): CryptographicSalt[] {
    return Array.from(this.salts.values()).filter(
      (salt) => salt.status === 'active'
    );
  }

  /**
   * Get historical salts for a specific purpose and platform
   *
   * @param purpose - Purpose of the salt
   * @param platform - Platform identifier
   * @returns Array of historical salts
   */
  public getHistoricalSalts(
    purpose: SaltPurpose,
    platform: string
  ): CryptographicSalt[] {
    return Array.from(this.salts.values())
      .filter((salt) => salt.purpose === purpose && salt.platform === platform)
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  }

  /**
   * Initialize salts on startup
   * In production, this would load existing salts from a database
   */
  private initializeSalts(): void {
    const purposes: SaltPurpose[] = ['source', 'correlation', 'content'];
    const platforms = ['default', 'facebook', 'twitter', 'reddit', 'global'];

    for (const purpose of purposes) {
      for (const platform of platforms) {
        this.createNewSalt(purpose, platform);
      }
    }

    this.logger.log(`Initialized ${this.salts.size} salts`);
  }

  /**
   * Create a new salt for a specific purpose and platform
   *
   * @param purpose - Purpose of the salt
   * @param platform - Platform identifier
   * @returns Newly created salt
   */
  private createNewSalt(
    purpose: SaltPurpose,
    platform: string
  ): CryptographicSalt {
    // Expire existing active salt if it exists
    this.expireCurrentSalt(purpose, platform);

    // Create new salt
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 60); // 60 days expiration

    const salt: CryptographicSalt = {
      id: crypto.randomUUID(),
      purpose,
      platform,
      value: crypto.randomBytes(32).toString('hex'),
      effectiveFrom: now,
      expiresAt,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // Store the salt
    this.salts.set(this.getSaltKey(purpose, platform), salt);

    this.logger.debug(`Created new salt for ${purpose}/${platform}`);
    return salt;
  }

  /**
   * Expire the current active salt for a specific purpose and platform
   *
   * @param purpose - Purpose of the salt
   * @param platform - Platform identifier
   */
  private expireCurrentSalt(purpose: SaltPurpose, platform: string): void {
    const key = this.getSaltKey(purpose, platform);
    const currentSalt = this.salts.get(key);

    if (currentSalt && currentSalt.status === 'active') {
      currentSalt.status = 'expired';
      currentSalt.updatedAt = new Date();
      this.salts.set(key, currentSalt);

      // Store expired salt with a different key to maintain history
      this.salts.set(`${key}:${currentSalt.id}`, currentSalt);
      this.logger.debug(`Expired salt for ${purpose}/${platform}`);
    }
  }

  /**
   * Get a unique key for a salt
   *
   * @param purpose - Purpose of the salt
   * @param platform - Platform identifier
   * @returns Unique key
   */
  private getSaltKey(purpose: SaltPurpose, platform: string): string {
    return `${purpose}:${platform}:active`;
  }

  /**
   * Get unique platforms from current salts
   *
   * @returns Array of unique platforms
   */
  private getUniquePlatforms(): string[] {
    const platforms = new Set<string>();

    for (const salt of this.salts.values()) {
      platforms.add(salt.platform);
    }

    return Array.from(platforms);
  }
}
