import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DeepInvestigationResult } from './deep-investigation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportSummary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  byPlatform: Record<string, number>;
}

export interface ReportParams {
  query: string;
  summary: ReportSummary;
  narratives: AnalyzedNarrative[];
  investigation?: DeepInvestigationResult;
  format: 'markdown' | 'html';
}

export interface ReportResult {
  content: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = 'gemini-2.0-flash';

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log('ReportService initialized');
    } else {
      this.logger.warn(
        'GEMINI_API_KEY not set — report executive summaries will use fallback text',
      );
    }
  }

  /**
   * Generate a narrative analysis report.
   * Uses LLM to write executive summary prose; structured data is formatted
   * as tables/lists (not LLM-generated).
   */
  async generateReport(params: ReportParams): Promise<ReportResult> {
    const { query, summary, narratives, investigation, format } = params;

    this.logger.log(`Generating ${format} report for "${query}" (${narratives.length} narratives)`);

    const executiveSummary = await this.writeExecutiveSummary(
      query,
      summary,
      narratives,
      investigation,
    );

    const sections: string[] = [];

    if (format === 'markdown') {
      sections.push(this.mdTitle(query));
      sections.push(this.mdExecutiveSummary(executiveSummary, summary));
      sections.push(this.mdNarrativeLandscape(narratives));
      if (investigation) {
        sections.push(this.mdKeyActors(investigation));
        sections.push(this.mdCoordination(investigation));
        sections.push(this.mdCuiBono(investigation));
      }
      sections.push(this.mdMethodology(query, summary, narratives, investigation));
    } else {
      sections.push(this.htmlOpen(query));
      sections.push(this.htmlExecutiveSummary(executiveSummary, summary));
      sections.push(this.htmlNarrativeLandscape(narratives));
      if (investigation) {
        sections.push(this.htmlKeyActors(investigation));
        sections.push(this.htmlCoordination(investigation));
        sections.push(this.htmlCuiBono(investigation));
      }
      sections.push(this.htmlMethodology(query, summary, narratives, investigation));
      sections.push(this.htmlClose());
    }

    return {
      content: sections.join('\n\n'),
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // LLM — Executive Summary
  // ---------------------------------------------------------------------------

  private async writeExecutiveSummary(
    query: string,
    summary: ReportSummary,
    narratives: AnalyzedNarrative[],
    investigation?: DeepInvestigationResult,
  ): Promise<string> {
    const fallback = this.fallbackExecutiveSummary(query, summary, narratives, investigation);

    if (!this.genAI || narratives.length === 0) {
      return fallback;
    }

    const narrativeBriefs = narratives
      .slice(0, 10)
      .map(
        (n, i) =>
          `${i + 1}. "${n.summary}" — ${n.postIndices.length} posts, sentiment ${n.avgSentiment.toFixed(2)}, trend: ${n.velocity.trend}`,
      )
      .join('\n');

    const platformBreakdown = Object.entries(summary.byPlatform)
      .map(([p, c]) => `${p}: ${c}`)
      .join(', ');

    let investigationContext = '';
    if (investigation) {
      investigationContext = `\nInvestigation findings:
- First mover: @${investigation.originAnalysis.firstMover} on ${investigation.originAnalysis.firstPlatform}
- Coordination clusters: ${investigation.coordination.clusters.length}
- Cui bono: ${investigation.cuiBono.summary}`;
    }

    const prompt = `You are an intelligence analyst writing a professional executive summary for a narrative analysis report.

Topic: "${query}"
Total posts analyzed: ${summary.total}
Sentiment breakdown: ${summary.positive} positive, ${summary.negative} negative, ${summary.neutral} neutral
Platforms: ${platformBreakdown}

Top narratives detected:
${narrativeBriefs}
${investigationContext}

Write a 2-3 paragraph executive summary in professional prose. Be analytical, objective, and concise.
- Paragraph 1: Overview of the narrative landscape — what is being said and where
- Paragraph 2: Key findings — dominant narratives, velocity trends, sentiment patterns
- Paragraph 3 (if investigation data): Notable findings from deeper investigation (origin, coordination, cui bono)

Do NOT use markdown formatting. Just write clean prose paragraphs separated by newlines.`;

    try {
      const model = this.genAI.getGenerativeModel({ model: this.chatModel });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text.length > 50) {
        return text;
      }
    } catch (err) {
      this.logger.warn(`Executive summary LLM failed: ${err}`);
    }

    return fallback;
  }

  private fallbackExecutiveSummary(
    query: string,
    summary: ReportSummary,
    narratives: AnalyzedNarrative[],
    investigation?: DeepInvestigationResult,
  ): string {
    const platforms = Object.keys(summary.byPlatform).join(', ') || 'unknown platforms';
    const dominant = narratives[0];
    const surgingCount = narratives.filter((n) => n.velocity.trend === 'surging').length;
    const fadingCount = narratives.filter((n) => n.velocity.trend === 'fading').length;

    let text = `Analysis of "${query}" identified ${summary.total} posts across ${platforms}, organized into ${narratives.length} distinct narrative clusters. Sentiment is predominantly ${summary.positive > summary.negative ? 'positive' : summary.negative > summary.positive ? 'negative' : 'neutral'} (${summary.positive} positive, ${summary.negative} negative, ${summary.neutral} neutral).`;

    if (dominant) {
      text += `\n\nThe dominant narrative — "${dominant.summary}" — accounts for ${dominant.postIndices.length} posts with a ${dominant.velocity.trend} velocity trend.`;
      if (surgingCount > 0) {
        text += ` ${surgingCount} narrative${surgingCount > 1 ? 's are' : ' is'} currently surging.`;
      }
      if (fadingCount > 0) {
        text += ` ${fadingCount} narrative${fadingCount > 1 ? 's are' : ' is'} fading.`;
      }
    }

    if (investigation) {
      text += `\n\nDeep investigation traced the narrative origin to @${investigation.originAnalysis.firstMover} on ${investigation.originAnalysis.firstPlatform}. ${investigation.coordination.summary}. ${investigation.cuiBono.summary}`;
    }

    return text;
  }

  // ---------------------------------------------------------------------------
  // Markdown formatting
  // ---------------------------------------------------------------------------

  private mdTitle(query: string): string {
    const now = new Date().toISOString().split('T')[0];
    return `# Narrative Analysis Report: ${query}\n\n**Generated:** ${now}`;
  }

  private mdExecutiveSummary(prose: string, summary: ReportSummary): string {
    return `## Executive Summary\n\n${prose}\n\n| Metric | Value |\n|--------|-------|\n| Total Posts | ${summary.total} |\n| Positive | ${summary.positive} |\n| Negative | ${summary.negative} |\n| Neutral | ${summary.neutral} |\n${Object.entries(
      summary.byPlatform,
    )
      .map(([p, c]) => `| ${p} | ${c} |`)
      .join('\n')}`;
  }

  private mdNarrativeLandscape(narratives: AnalyzedNarrative[]): string {
    if (narratives.length === 0) {
      return '## Narrative Landscape\n\nNo distinct narratives detected.';
    }

    const rows = narratives.map((n, i) => {
      const platforms = Object.entries(n.platforms)
        .map(([p, c]) => `${p}(${c})`)
        .join(', ');
      const trendIcon =
        n.velocity.trend === 'surging'
          ? 'SURGING'
          : n.velocity.trend === 'growing'
            ? 'Growing'
            : n.velocity.trend === 'fading'
              ? 'Fading'
              : 'Steady';
      return `| ${i + 1} | ${n.summary} | ${n.postIndices.length} | ${n.avgSentiment.toFixed(2)} | ${trendIcon} (${n.velocity.postsPerHour.toFixed(1)}/hr) | ${platforms} |`;
    });

    let md = `## Narrative Landscape\n\n| # | Narrative | Posts | Sentiment | Velocity | Platforms |\n|---|-----------|-------|-----------|----------|-----------|\n${rows.join('\n')}`;

    // Highlight dominant
    const dominant = narratives[0];
    if (dominant) {
      md += `\n\n**Dominant narrative:** "${dominant.summary}" with ${dominant.postIndices.length} posts.`;
    }

    // Note emerging/fading
    const surging = narratives.filter((n) => n.velocity.trend === 'surging');
    const fading = narratives.filter((n) => n.velocity.trend === 'fading');
    if (surging.length > 0) {
      md += `\n\n**Surging narratives:** ${surging.map((n) => `"${n.summary}"`).join(', ')}`;
    }
    if (fading.length > 0) {
      md += `\n\n**Fading narratives:** ${fading.map((n) => `"${n.summary}"`).join(', ')}`;
    }

    // Per-narrative detail
    for (const n of narratives) {
      md += `\n\n### ${n.summary}\n\n`;
      md += `- **Posts:** ${n.postIndices.length}\n`;
      md += `- **Sentiment:** ${n.avgSentiment.toFixed(2)}\n`;
      md += `- **Engagement:** ${n.totalEngagement.toLocaleString()}\n`;
      md += `- **Velocity:** ${n.velocity.postsPerHour.toFixed(1)} posts/hr (${n.velocity.trend})\n`;
      md += `- **First seen:** ${n.firstSeen}\n`;
      md += `- **Last seen:** ${n.lastSeen}\n`;
      md += `- **Platforms:** ${Object.entries(n.platforms)
        .map(([p, c]) => `${p}: ${c}`)
        .join(', ')}\n`;
      if (n.authors.length > 0) {
        md += `- **Top authors:** ${n.authors
          .slice(0, 5)
          .map((a) => `@${a.handle || a.name} (${a.postCount})`)
          .join(', ')}\n`;
      }
    }

    return md;
  }

  private mdKeyActors(inv: DeepInvestigationResult): string {
    const topUsers = inv.users.slice(0, 15);
    if (topUsers.length === 0) {
      return '## Key Actors\n\nNo user data available.';
    }

    const rows = topUsers.map(
      (u) =>
        `| @${u.user.handle} | ${u.user.platform} | ${u.influenceScore.toFixed(2)} | ${u.adoptionTimestamp ? new Date(u.adoptionTimestamp).toISOString().split('T')[0] : 'N/A'} | ${u.flags.length > 0 ? u.flags.join('; ') : 'None'} |`,
    );

    let md = `## Key Actors\n\n| Handle | Platform | Influence | First Post | Flags |\n|--------|----------|-----------|------------|-------|\n${rows.join('\n')}`;

    // Origin
    md += `\n\n### Origin Analysis\n\n`;
    md += `- **First mover:** @${inv.originAnalysis.firstMover}\n`;
    md += `- **Platform:** ${inv.originAnalysis.firstPlatform}\n`;
    md += `- **Timestamp:** ${inv.originAnalysis.firstTimestamp}\n`;
    if (inv.originAnalysis.propagationChain.length > 0) {
      md += `- **Propagation chain:** ${inv.originAnalysis.propagationChain.map((h) => `@${h}`).join(' -> ')}\n`;
    }

    return md;
  }

  private mdCoordination(inv: DeepInvestigationResult): string {
    let md = `## Coordination Analysis\n\n${inv.coordination.summary}\n`;

    if (inv.coordination.clusters.length > 0) {
      for (const cluster of inv.coordination.clusters) {
        md += `\n### Cluster (confidence: ${(cluster.confidence * 100).toFixed(0)}%)\n\n`;
        md += `**Pattern:** ${cluster.pattern}\n\n`;
        md += `**Users:** ${cluster.users.map((u) => `@${u}`).join(', ')}\n`;
      }
    }

    return md;
  }

  private mdCuiBono(inv: DeepInvestigationResult): string {
    let md = `## Cui Bono (Who Benefits)\n\n${inv.cuiBono.summary}\n`;

    if (inv.cuiBono.beneficiaries.length > 0) {
      md += `\n| Entity | How They Benefit | Confidence |\n|--------|-----------------|------------|\n`;
      for (const b of inv.cuiBono.beneficiaries) {
        md += `| ${b.entity} | ${b.howTheyBenefit} | ${(b.confidence * 100).toFixed(0)}% |\n`;
      }
    }

    if (inv.cuiBono.agendas.length > 0) {
      md += `\n**Identified agendas:**\n\n`;
      for (const agenda of inv.cuiBono.agendas) {
        md += `- ${agenda}\n`;
      }
    }

    return md;
  }

  private mdMethodology(
    query: string,
    summary: ReportSummary,
    narratives: AnalyzedNarrative[],
    investigation?: DeepInvestigationResult,
  ): string {
    const platforms = Object.keys(summary.byPlatform).join(', ') || 'N/A';
    const allFirstSeen = narratives
      .map((n) => n.firstSeen)
      .filter(Boolean)
      .sort();
    const allLastSeen = narratives
      .map((n) => n.lastSeen)
      .filter(Boolean)
      .sort();
    const timeRange =
      allFirstSeen.length > 0 && allLastSeen.length > 0
        ? `${allFirstSeen[0]} to ${allLastSeen[allLastSeen.length - 1]}`
        : 'N/A';

    let md = `## Methodology\n\n`;
    md += `- **Query:** "${query}"\n`;
    md += `- **Data sources:** ${platforms}\n`;
    md += `- **Time range:** ${timeRange}\n`;
    md += `- **Total posts analyzed:** ${summary.total}\n`;
    md += `- **Narrative clusters detected:** ${narratives.length}\n`;
    md += `- **Analysis methods:** Semantic embedding (Gemini text-embedding-004), agglomerative clustering, LLM summarization (Gemini), velocity scoring\n`;
    if (investigation) {
      md += `- **Deep investigation:** Origin tracing, coordination detection, cui bono analysis\n`;
      md += `- **Users investigated:** ${investigation.users.length}\n`;
    }
    md += `\n### Limitations and Caveats\n\n`;
    md += `- Results are based on publicly available social media data and may not represent the full conversation.\n`;
    md += `- Sentiment analysis and narrative clustering are automated and may contain errors.\n`;
    md += `- Coordination detection identifies temporal patterns but does not prove intentional coordination.\n`;
    md += `- Cui bono analysis is LLM-generated and represents analytical hypotheses, not confirmed findings.\n`;

    return md;
  }

  // ---------------------------------------------------------------------------
  // HTML formatting
  // ---------------------------------------------------------------------------

  private htmlOpen(query: string): string {
    const now = new Date().toISOString().split('T')[0];
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Narrative Analysis Report: ${this.escapeHtml(query)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; color: #1a1a2e; background: #fafafa; line-height: 1.6; }
  h1 { font-size: 24px; color: #1a1a2e; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; }
  h2 { font-size: 20px; color: #312e81; margin-top: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
  h3 { font-size: 16px; color: #4338ca; margin-top: 20px; }
  p { margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 14px; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; color: #475569; }
  tr:nth-child(even) { background: #f8fafc; }
  .meta { color: #64748b; font-size: 14px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
  .badge-surging { background: #fef3c7; color: #92400e; }
  .badge-growing { background: #dbeafe; color: #1e40af; }
  .badge-steady { background: #f1f5f9; color: #475569; }
  .badge-fading { background: #f1f5f9; color: #94a3b8; }
  .badge-positive { background: #dcfce7; color: #166534; }
  .badge-negative { background: #fecaca; color: #991b1b; }
  .badge-neutral { background: #f1f5f9; color: #475569; }
  .narrative-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 12px 0; background: white; }
  .narrative-card h3 { margin-top: 0; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
  .caveats { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-top: 16px; }
  .caveats p { font-size: 14px; color: #92400e; margin: 4px 0; }
</style>
</head>
<body>
<h1>Narrative Analysis Report: ${this.escapeHtml(query)}</h1>
<p class="meta">Generated: ${now}</p>`;
  }

  private htmlClose(): string {
    return `</body>\n</html>`;
  }

  private htmlExecutiveSummary(prose: string, summary: ReportSummary): string {
    const paragraphs = prose
      .split('\n')
      .filter((l) => l.trim())
      .map((p) => `<p>${this.escapeHtml(p)}</p>`)
      .join('\n');

    const platformRows = Object.entries(summary.byPlatform)
      .map(([p, c]) => `<tr><td>${this.escapeHtml(p)}</td><td>${c}</td></tr>`)
      .join('\n');

    return `<h2>Executive Summary</h2>
${paragraphs}
<table>
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>Total Posts</td><td>${summary.total}</td></tr>
<tr><td>Positive</td><td>${summary.positive}</td></tr>
<tr><td>Negative</td><td>${summary.negative}</td></tr>
<tr><td>Neutral</td><td>${summary.neutral}</td></tr>
${platformRows}
</table>`;
  }

  private htmlNarrativeLandscape(narratives: AnalyzedNarrative[]): string {
    if (narratives.length === 0) {
      return '<h2>Narrative Landscape</h2>\n<p>No distinct narratives detected.</p>';
    }

    const trendBadge = (trend: string) => {
      const cls =
        trend === 'surging'
          ? 'badge-surging'
          : trend === 'growing'
            ? 'badge-growing'
            : trend === 'fading'
              ? 'badge-fading'
              : 'badge-steady';
      return `<span class="badge ${cls}">${trend}</span>`;
    };

    const summaryRows = narratives
      .map((n, i) => {
        const platforms = Object.entries(n.platforms)
          .map(([p, c]) => `${p}(${c})`)
          .join(', ');
        return `<tr><td>${i + 1}</td><td>${this.escapeHtml(n.summary)}</td><td>${n.postIndices.length}</td><td>${n.avgSentiment.toFixed(2)}</td><td>${trendBadge(n.velocity.trend)} ${n.velocity.postsPerHour.toFixed(1)}/hr</td><td>${platforms}</td></tr>`;
      })
      .join('\n');

    let html = `<h2>Narrative Landscape</h2>
<table>
<tr><th>#</th><th>Narrative</th><th>Posts</th><th>Sentiment</th><th>Velocity</th><th>Platforms</th></tr>
${summaryRows}
</table>`;

    // Dominant
    const dominant = narratives[0];
    if (dominant) {
      html += `<p><strong>Dominant narrative:</strong> "${this.escapeHtml(dominant.summary)}" with ${dominant.postIndices.length} posts.</p>`;
    }

    // Surging / fading
    const surging = narratives.filter((n) => n.velocity.trend === 'surging');
    const fading = narratives.filter((n) => n.velocity.trend === 'fading');
    if (surging.length > 0) {
      html += `<p><strong>Surging narratives:</strong> ${surging.map((n) => `"${this.escapeHtml(n.summary)}"`).join(', ')}</p>`;
    }
    if (fading.length > 0) {
      html += `<p><strong>Fading narratives:</strong> ${fading.map((n) => `"${this.escapeHtml(n.summary)}"`).join(', ')}</p>`;
    }

    // Per-narrative cards
    for (const n of narratives) {
      const authors = n.authors
        .slice(0, 5)
        .map((a) => `@${a.handle || a.name} (${a.postCount})`)
        .join(', ');

      html += `
<div class="narrative-card">
  <h3>${this.escapeHtml(n.summary)}</h3>
  <ul>
    <li><strong>Posts:</strong> ${n.postIndices.length}</li>
    <li><strong>Sentiment:</strong> ${n.avgSentiment.toFixed(2)}</li>
    <li><strong>Engagement:</strong> ${n.totalEngagement.toLocaleString()}</li>
    <li><strong>Velocity:</strong> ${n.velocity.postsPerHour.toFixed(1)} posts/hr ${trendBadge(n.velocity.trend)}</li>
    <li><strong>First seen:</strong> ${n.firstSeen}</li>
    <li><strong>Last seen:</strong> ${n.lastSeen}</li>
    <li><strong>Platforms:</strong> ${Object.entries(n.platforms)
      .map(([p, c]) => `${p}: ${c}`)
      .join(', ')}</li>
    ${authors ? `<li><strong>Top authors:</strong> ${authors}</li>` : ''}
  </ul>
</div>`;
    }

    return html;
  }

  private htmlKeyActors(inv: DeepInvestigationResult): string {
    const topUsers = inv.users.slice(0, 15);
    if (topUsers.length === 0) {
      return '<h2>Key Actors</h2>\n<p>No user data available.</p>';
    }

    const rows = topUsers
      .map(
        (u) =>
          `<tr><td>@${this.escapeHtml(u.user.handle)}</td><td>${this.escapeHtml(u.user.platform)}</td><td>${u.influenceScore.toFixed(2)}</td><td>${u.adoptionTimestamp ? new Date(u.adoptionTimestamp).toISOString().split('T')[0] : 'N/A'}</td><td>${u.flags.length > 0 ? u.flags.map((f) => this.escapeHtml(f)).join('; ') : 'None'}</td></tr>`,
      )
      .join('\n');

    let html = `<h2>Key Actors</h2>
<table>
<tr><th>Handle</th><th>Platform</th><th>Influence</th><th>First Post</th><th>Flags</th></tr>
${rows}
</table>

<h3>Origin Analysis</h3>
<ul>
  <li><strong>First mover:</strong> @${this.escapeHtml(inv.originAnalysis.firstMover)}</li>
  <li><strong>Platform:</strong> ${this.escapeHtml(inv.originAnalysis.firstPlatform)}</li>
  <li><strong>Timestamp:</strong> ${inv.originAnalysis.firstTimestamp}</li>`;

    if (inv.originAnalysis.propagationChain.length > 0) {
      html += `\n  <li><strong>Propagation chain:</strong> ${inv.originAnalysis.propagationChain.map((h) => `@${this.escapeHtml(h)}`).join(' &rarr; ')}</li>`;
    }

    html += '\n</ul>';
    return html;
  }

  private htmlCoordination(inv: DeepInvestigationResult): string {
    let html = `<h2>Coordination Analysis</h2>\n<p>${this.escapeHtml(inv.coordination.summary)}</p>`;

    for (const cluster of inv.coordination.clusters) {
      html += `
<div class="narrative-card">
  <h3>Cluster (confidence: ${(cluster.confidence * 100).toFixed(0)}%)</h3>
  <p><strong>Pattern:</strong> ${this.escapeHtml(cluster.pattern)}</p>
  <p><strong>Users:</strong> ${cluster.users.map((u) => `@${this.escapeHtml(u)}`).join(', ')}</p>
</div>`;
    }

    return html;
  }

  private htmlCuiBono(inv: DeepInvestigationResult): string {
    let html = `<h2>Cui Bono (Who Benefits)</h2>\n<p>${this.escapeHtml(inv.cuiBono.summary)}</p>`;

    if (inv.cuiBono.beneficiaries.length > 0) {
      const rows = inv.cuiBono.beneficiaries
        .map(
          (b) =>
            `<tr><td>${this.escapeHtml(b.entity)}</td><td>${this.escapeHtml(b.howTheyBenefit)}</td><td>${(b.confidence * 100).toFixed(0)}%</td></tr>`,
        )
        .join('\n');

      html += `
<table>
<tr><th>Entity</th><th>How They Benefit</th><th>Confidence</th></tr>
${rows}
</table>`;
    }

    if (inv.cuiBono.agendas.length > 0) {
      html += `<p><strong>Identified agendas:</strong></p>\n<ul>\n${inv.cuiBono.agendas.map((a) => `<li>${this.escapeHtml(a)}</li>`).join('\n')}\n</ul>`;
    }

    return html;
  }

  private htmlMethodology(
    query: string,
    summary: ReportSummary,
    narratives: AnalyzedNarrative[],
    investigation?: DeepInvestigationResult,
  ): string {
    const platforms = Object.keys(summary.byPlatform).join(', ') || 'N/A';
    const allFirstSeen = narratives
      .map((n) => n.firstSeen)
      .filter(Boolean)
      .sort();
    const allLastSeen = narratives
      .map((n) => n.lastSeen)
      .filter(Boolean)
      .sort();
    const timeRange =
      allFirstSeen.length > 0 && allLastSeen.length > 0
        ? `${allFirstSeen[0]} to ${allLastSeen[allLastSeen.length - 1]}`
        : 'N/A';

    let html = `<h2>Methodology</h2>
<ul>
  <li><strong>Query:</strong> "${this.escapeHtml(query)}"</li>
  <li><strong>Data sources:</strong> ${this.escapeHtml(platforms)}</li>
  <li><strong>Time range:</strong> ${timeRange}</li>
  <li><strong>Total posts analyzed:</strong> ${summary.total}</li>
  <li><strong>Narrative clusters detected:</strong> ${narratives.length}</li>
  <li><strong>Analysis methods:</strong> Semantic embedding (Gemini text-embedding-004), agglomerative clustering, LLM summarization (Gemini), velocity scoring</li>`;

    if (investigation) {
      html += `\n  <li><strong>Deep investigation:</strong> Origin tracing, coordination detection, cui bono analysis</li>`;
      html += `\n  <li><strong>Users investigated:</strong> ${investigation.users.length}</li>`;
    }

    html += `\n</ul>
<div class="caveats">
  <h3>Limitations and Caveats</h3>
  <p>Results are based on publicly available social media data and may not represent the full conversation.</p>
  <p>Sentiment analysis and narrative clustering are automated and may contain errors.</p>
  <p>Coordination detection identifies temporal patterns but does not prove intentional coordination.</p>
  <p>Cui bono analysis is LLM-generated and represents analytical hypotheses, not confirmed findings.</p>
</div>`;

    return html;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
