import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EvidenceSeed, ExtractedEntity } from '../schemas/investigation.schema';
import { YOUTUBE_CONNECTOR } from '../interfaces/connector-tokens';
import { JinaReaderService } from './utils/jina-reader.service';

type EvidenceSeedKind = EvidenceSeed['kind'];
type EvidenceSeedStatus = EvidenceSeed['status'];

interface SeedDraft {
  kind: EvidenceSeedKind;
  value: string;
  label?: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  extractedEntities?: ExtractedEntity[];
}

interface YouTubeTranscriptConnector {
  getVideoTranscript?(videoId: string): Promise<string>;
}

@Injectable()
export class InvestigationEvidenceService {
  private readonly logger = new Logger(InvestigationEvidenceService.name);
  private readonly maxStoredContentChars = 12000;
  private readonly maxPreviewChars = 320;

  constructor(
    private readonly jinaReader: JinaReaderService,
    @Optional()
    @Inject(YOUTUBE_CONNECTOR)
    private readonly youtubeConnector?: YouTubeTranscriptConnector,
  ) {}

  async prepareSeed(seed: EvidenceSeed): Promise<EvidenceSeed> {
    const normalizedKind = this.normalizeKind(seed.kind, seed.value);
    const metadata = { ...(seed.metadata ?? {}) };
    const textFragments = [seed.value, seed.notes ?? ''];
    let status: EvidenceSeedStatus = 'processed';

    try {
      if (normalizedKind === 'youtube') {
        const youtubeEvidence = await this.fetchYouTubeEvidence(seed.value);
        Object.assign(metadata, youtubeEvidence.metadata);
        if (youtubeEvidence.content) {
          textFragments.push(youtubeEvidence.content);
        }
      } else if (this.isFetchableUrlKind(normalizedKind, seed.value)) {
        const urlEvidence = await this.fetchUrlEvidence(seed.value);
        Object.assign(metadata, urlEvidence.metadata);
        if (urlEvidence.content) {
          textFragments.push(urlEvidence.content);
        }
      } else if (normalizedKind === 'domain') {
        const normalizedDomain = this.normalizeDomainValue(seed.value);
        if (normalizedDomain) {
          metadata['host'] = normalizedDomain;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      metadata['error'] = message;
      metadata['fetchFailedAt'] = new Date().toISOString();
      status = 'error';
      this.logger.warn(`Evidence seed fetch failed for "${seed.value}": ${message}`);
    }

    const extractedEntities = this.mergeEntities(
      seed.extractedEntities ?? [],
      this.extractEntities(textFragments.filter(Boolean).join('\n\n'), normalizedKind, seed.value),
    );

    return {
      ...seed,
      kind: normalizedKind,
      label: seed.label?.trim() || this.buildLabel(normalizedKind, seed.value, metadata),
      metadata,
      extractedEntities,
      status,
      updatedAt: new Date(),
    };
  }

  private normalizeKind(kind: EvidenceSeedKind, value: string): EvidenceSeedKind {
    const trimmed = value.trim();
    const parsedUrl = this.tryParseUrl(trimmed);
    if (parsedUrl) {
      const host = parsedUrl.hostname.toLowerCase();
      if (this.isYouTubeHost(host)) return 'youtube';
      if (kind === 'domain') return 'domain';
      if (kind === 'url' && this.looksLikeArticleUrl(parsedUrl)) return 'article';
      return kind;
    }

    if (kind === 'url') {
      if (this.isEthereumAddress(trimmed)) return 'wallet';
      if (this.isBareDomain(trimmed)) return 'domain';
    }

    return kind;
  }

  private async fetchYouTubeEvidence(value: string): Promise<{
    metadata: Record<string, unknown>;
    content: string;
  }> {
    const videoId = this.extractYouTubeVideoId(value);
    const metadata: Record<string, unknown> = {
      sourceUrl: value,
      videoId,
      fetchedAt: new Date().toISOString(),
    };

    if (!videoId) {
      return { metadata, content: '' };
    }

    if (!this.youtubeConnector?.getVideoTranscript) {
      metadata['transcriptAvailable'] = false;
      metadata['fetchSkipped'] = 'youtube connector unavailable';
      return { metadata, content: '' };
    }

    const transcript = await this.youtubeConnector.getVideoTranscript(videoId);
    if (!transcript) {
      metadata['transcriptAvailable'] = false;
      return { metadata, content: '' };
    }

    metadata['transcriptAvailable'] = true;
    metadata['contentLength'] = transcript.length;
    metadata['fetchedContent'] = this.truncate(transcript, this.maxStoredContentChars);
    metadata['contentPreview'] = this.makePreview(transcript);

    return { metadata, content: transcript };
  }

  private async fetchUrlEvidence(value: string): Promise<{
    metadata: Record<string, unknown>;
    content: string;
  }> {
    const parsedUrl = this.tryParseUrl(value);
    const readResult = await this.jinaReader.readUrl(value, {
      format: 'markdown',
      timeout: 15000,
    });

    const combined = [readResult.title, readResult.description, readResult.content]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    return {
      metadata: {
        sourceUrl: readResult.url || value,
        host: parsedUrl?.hostname?.toLowerCase() ?? null,
        title: readResult.title ?? null,
        description: readResult.description ?? null,
        fetchedAt: new Date().toISOString(),
        contentLength: combined.length,
        fetchedContent: this.truncate(combined, this.maxStoredContentChars),
        contentPreview: this.makePreview(combined),
      },
      content: combined,
    };
  }

  private extractEntities(
    text: string,
    kind: EvidenceSeedKind,
    rawValue: string,
  ): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const add = (type: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      entities.push({ type, value: trimmed });
    };

    const domainMatches = text.match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi) ?? [];
    for (const domain of domainMatches) {
      add('domain', domain.toLowerCase());
    }

    const urlMatches = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
    for (const rawUrl of urlMatches) {
      const parsedUrl = this.tryParseUrl(rawUrl);
      if (!parsedUrl) continue;
      add('url', rawUrl);
      add('domain', parsedUrl.hostname.toLowerCase());

      if (this.isYouTubeHost(parsedUrl.hostname)) {
        const videoId = this.extractYouTubeVideoId(rawUrl);
        if (videoId) add('youtube_video', videoId);
      }

      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      if ((parsedUrl.hostname.includes('x.com') || parsedUrl.hostname.includes('twitter.com')) && pathSegments[0]) {
        add('handle', `@${pathSegments[0].replace(/^@/, '')}`);
      }
      if (parsedUrl.hostname.includes('t.me') && pathSegments[0]) {
        add('telegram', pathSegments[0]);
      }
    }

    const handleRegex = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,32})\b/g;
    for (const match of text.matchAll(handleRegex)) {
      add('handle', `@${match[2]}`);
    }

    const telegramRegex = /\bt\.me\/([A-Za-z0-9_]{2,})\b/gi;
    for (const match of text.matchAll(telegramRegex)) {
      if (match[1]) {
        add('telegram', match[1]);
      }
    }

    const addressMatches = text.match(/\b0x[a-fA-F0-9]{40}\b/g) ?? [];
    for (const address of addressMatches) {
      add(kind === 'contract' ? 'contract' : kind === 'wallet' ? 'wallet' : 'address', address);
    }

    if (kind === 'domain') {
      const normalizedDomain = this.normalizeDomainValue(rawValue);
      if (normalizedDomain) add('domain', normalizedDomain);
    }

    const videoId = kind === 'youtube' ? this.extractYouTubeVideoId(rawValue) : null;
    if (videoId) {
      add('youtube_video', videoId);
    }

    return this.dedupeEntities(entities);
  }

  private dedupeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Set<string>();
    const deduped: ExtractedEntity[] = [];

    for (const entity of entities) {
      const key = `${entity.type}:${entity.value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entity);
    }

    return deduped;
  }

  private mergeEntities(existing: ExtractedEntity[], incoming: ExtractedEntity[]): ExtractedEntity[] {
    return this.dedupeEntities([...(existing ?? []), ...(incoming ?? [])]);
  }

  private buildLabel(
    kind: EvidenceSeedKind,
    value: string,
    metadata: Record<string, unknown>,
  ): string {
    const title = typeof metadata['title'] === 'string' ? metadata['title'].trim() : '';
    const host = typeof metadata['host'] === 'string' ? metadata['host'].trim() : '';

    if (title) return title.slice(0, 140);
    if (kind === 'youtube') return host ? `YouTube · ${host}` : 'YouTube evidence';
    if (kind === 'note') return 'Analyst note';
    if (kind === 'wallet') return value.trim();
    if (kind === 'contract') return value.trim();
    if (kind === 'domain') return this.normalizeDomainValue(value) || value.trim();
    if (host) return host;
    return value.trim().slice(0, 140);
  }

  private isFetchableUrlKind(kind: EvidenceSeedKind, value: string): boolean {
    if (!this.tryParseUrl(value)) return false;
    return kind === 'url' || kind === 'article' || kind === 'post' || kind === 'document';
  }

  private looksLikeArticleUrl(parsedUrl: URL): boolean {
    const path = parsedUrl.pathname.toLowerCase();
    return path.split('/').filter(Boolean).length >= 2 || path.includes('/news/') || path.includes('/article/');
  }

  private normalizeDomainValue(value: string): string | null {
    const parsedUrl = this.tryParseUrl(value);
    if (parsedUrl) {
      return parsedUrl.hostname.toLowerCase();
    }
    const trimmed = value.trim().toLowerCase();
    return this.isBareDomain(trimmed) ? trimmed : null;
  }

  private isBareDomain(value: string): boolean {
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value.trim());
  }

  private isEthereumAddress(value: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
  }

  private tryParseUrl(value: string): URL | null {
    try {
      return new URL(value.trim());
    } catch {
      return null;
    }
  }

  private isYouTubeHost(host: string): boolean {
    const lower = host.toLowerCase();
    return lower.includes('youtube.com') || lower === 'youtu.be' || lower.endsWith('.youtu.be');
  }

  private extractYouTubeVideoId(value: string): string | null {
    const parsedUrl = this.tryParseUrl(value);
    if (!parsedUrl) return null;
    if (parsedUrl.hostname === 'youtu.be') {
      return parsedUrl.pathname.split('/').filter(Boolean)[0] ?? null;
    }
    if (parsedUrl.searchParams.get('v')) {
      return parsedUrl.searchParams.get('v');
    }
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    const embedIndex = pathSegments.findIndex((segment) => segment === 'embed' || segment === 'shorts');
    if (embedIndex >= 0 && pathSegments[embedIndex + 1]) {
      return pathSegments[embedIndex + 1] ?? null;
    }
    return null;
  }

  private truncate(value: string, maxChars: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars)}...`;
  }

  private makePreview(value: string): string {
    return this.truncate(value.replace(/\s+/g, ' '), this.maxPreviewChars);
  }
}
