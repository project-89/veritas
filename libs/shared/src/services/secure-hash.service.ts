import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { SaltRepository } from '../repositories/salt.repository';

/**
 * Provides cryptographically secure, irreversible hashing with salt management
 * Core component of the transform-on-ingest architecture
 */
@Injectable()
export class SecureHashService {
  // Salt rotation interval (30 days)
  private readonly SALT_ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000;

  constructor(private readonly saltRepository: SaltRepository) {
    // Schedule salt rotation
    this.scheduleSaltRotation();
  }

  /**
   * Double-hash an identifier for maximum anonymization
   * This prevents correlation across systems while maintaining
   * consistent identification within the system
   *
   * @param value - Original identifier to hash
   * @param primarySalt - Primary salt (platform-specific)
   * @param secondarySalt - Secondary salt (cross-correlation prevention)
   * @returns Securely hashed identifier
   */
  public doubleHash(
    value: string,
    primarySalt: string,
    secondarySalt: string
  ): string {
    const primaryHash = this.hashWithSalt(value, primarySalt);
    return this.hashWithSalt(primaryHash, secondarySalt);
  }

  /**
   * Create a unique content fingerprint that's consistent for similar content
   * but cannot be reversed to the original text
   *
   * @param content - Content to fingerprint
   * @param salt - Content fingerprinting salt
   * @returns Content fingerprint
   */
  public fingerprintContent(content: string, salt: string): string {
    // Normalize content (lowercase, remove extra spaces)
    const normalized = this.normalizeText(content);

    // Extract key phrases to build fingerprint
    const keyPhrases = this.extractKeyPhrases(normalized);

    // Sort for consistency
    keyPhrases.sort();

    // Hash the combined key phrases with salt
    return this.hashWithSalt(keyPhrases.join('|'), salt);
  }

  /**
   * Calculate a checksum for deduplication
   *
   * @param content - Content to calculate checksum for
   * @returns Checksum value
   */
  public calculateChecksum(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Get current source salt
   *
   * @param platform - Platform identifier
   * @returns Current source salt for the platform
   */
  public getSourceSalt(platform = 'default'): string {
    return this.saltRepository.getCurrentSalt('source', platform);
  }

  /**
   * Get current correlation salt
   *
   * @returns Current correlation salt
   */
  public getCorrelationSalt(): string {
    return this.saltRepository.getCurrentSalt('correlation', 'global');
  }

  /**
   * Get current content salt
   *
   * @param platform - Platform identifier
   * @returns Current content salt for the platform
   */
  public getContentSalt(platform = 'default'): string {
    return this.saltRepository.getCurrentSalt('content', platform);
  }

  /**
   * Hash a value with a salt
   *
   * @param value - Value to hash
   * @param salt - Salt to use
   * @returns Hashed value
   */
  private hashWithSalt(value: string, salt: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(value + salt);
    return hash.digest('hex');
  }

  /**
   * Normalize text for consistent fingerprinting
   *
   * @param text - Text to normalize
   * @returns Normalized text
   */
  private normalizeText(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract key phrases from text for fingerprinting
   *
   * @param text - Normalized text
   * @returns Array of key phrases
   */
  private extractKeyPhrases(text: string): string[] {
    // Simplified implementation - in production this would use NLP
    // to extract meaningful n-grams or key phrases

    // Split into sentences
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    // For each sentence, extract n-grams (3-word phrases)
    const phrases: string[] = [];

    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/);
      if (words.length < 3) {
        // For short sentences, just use the whole sentence
        phrases.push(sentence.trim());
        continue;
      }

      // Extract 3-grams
      for (let i = 0; i <= words.length - 3; i++) {
        phrases.push(words.slice(i, i + 3).join(' '));
      }
    }

    return phrases;
  }

  /**
   * Schedule periodic salt rotation
   */
  private scheduleSaltRotation(): void {
    setInterval(() => {
      this.saltRepository.rotateSalts();
    }, this.SALT_ROTATION_INTERVAL);
  }
}
