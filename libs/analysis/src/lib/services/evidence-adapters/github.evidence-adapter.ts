import { Logger } from '@nestjs/common';
import type { EvidenceAdapter, EvidenceSource } from './evidence-adapter.interface';

const DEV_KEYWORDS = ['development', 'code', 'project', 'software', 'repository', 'repo', 'commit', 'open-source', 'github'];
const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export class GitHubEvidenceAdapter implements EvidenceAdapter {
  readonly name = 'GitHub';
  readonly sourceType = 'social' as const;
  readonly claimDomains = ['development', 'code', 'project', 'software', 'repository', 'commit', 'open-source'];

  private readonly logger = new Logger(GitHubEvidenceAdapter.name);
  private readonly baseUrl = 'https://api.github.com';
  private readonly token: string | undefined;

  constructor() {
    this.token = process.env['GITHUB_TOKEN'];
  }

  canVerify(claim: string, entities: string[]): boolean {
    const text = `${claim} ${entities.join(' ')}`.toLowerCase();
    const hasKeyword = DEV_KEYWORDS.some((kw) => text.includes(kw));
    const hasRepoName = entities.some((e) => REPO_PATTERN.test(e));
    return hasKeyword || hasRepoName;
  }

  async fetchEvidence(params: {
    claim: string;
    entities: string[];
    timeRange?: { start: string; end: string };
  }): Promise<EvidenceSource[]> {
    const results: EvidenceSource[] = [];

    // Check for direct repo references (org/repo format)
    const repoEntities = params.entities.filter((e) => REPO_PATTERN.test(e));
    const nonRepoEntities = params.entities.filter((e) => !REPO_PATTERN.test(e));

    // Fetch data for direct repo references
    for (const repo of repoEntities.slice(0, 3)) {
      const repoData = await this.apiCall(`/repos/${repo}`);
      if (!repoData) continue;

      const r = repoData as GitHubRepo;
      results.push({
        source: `GitHub: ${r.full_name ?? repo}`,
        sourceType: 'social',
        credibilityScore: 0.9,
        url: r.html_url ?? `https://github.com/${repo}`,
        data: {
          fullName: r.full_name,
          stars: r.stargazers_count,
          forks: r.forks_count,
          openIssues: r.open_issues_count,
          language: r.language,
          pushedAt: r.pushed_at,
          createdAt: r.created_at,
          archived: r.archived,
          description: r.description,
        },
        excerpt: this.buildRepoExcerpt(r),
        relevance: 0.9,
        freshness: this.repoFreshness(r.pushed_at),
        stance: 'neutral',
        retrievedAt: new Date().toISOString(),
      });

      // Get commit activity
      const activity = await this.apiCall(`/repos/${repo}/stats/commit_activity`);
      if (Array.isArray(activity) && activity.length > 0) {
        const weeks = activity as GitHubWeeklyActivity[];
        const recentWeeks = weeks.slice(-4);
        const totalCommits = recentWeeks.reduce((sum, w) => sum + (w.total ?? 0), 0);
        results.push({
          source: `GitHub Commits: ${repo}`,
          sourceType: 'social',
          credibilityScore: 0.9,
          url: `https://github.com/${repo}/graphs/commit-activity`,
          data: { repo, recentWeeks: recentWeeks.length, totalRecentCommits: totalCommits },
          excerpt: `${repo} had ${totalCommits} commits in the last ${recentWeeks.length} weeks`,
          relevance: 0.8,
          freshness: 1.0,
          stance: totalCommits > 0 ? 'supports' : 'neutral',
          retrievedAt: new Date().toISOString(),
        });
      }

      // Get top contributors
      const contributors = await this.apiCall(`/repos/${repo}/contributors?per_page=5`);
      if (Array.isArray(contributors) && contributors.length > 0) {
        const contribs = contributors as GitHubContributor[];
        results.push({
          source: `GitHub Contributors: ${repo}`,
          sourceType: 'social',
          credibilityScore: 0.9,
          url: `https://github.com/${repo}/graphs/contributors`,
          data: { repo, topContributors: contribs.map((c) => ({ login: c.login, contributions: c.contributions })) },
          excerpt: `${repo} has ${contribs.length}+ contributors. Top: ${contribs.slice(0, 3).map((c) => `${c.login} (${c.contributions})`).join(', ')}`,
          relevance: 0.7,
          freshness: 0.8,
          stance: 'neutral',
          retrievedAt: new Date().toISOString(),
        });
      }
    }

    // Search for non-repo entities (skip social handles like @username)
    const searchableEntities = nonRepoEntities
      .map((e) => e.replace(/^@/, ''))
      .filter((e) => e.length > 2 && !/^[0-9a-f]{40}$/i.test(e) && !/^0x/i.test(e));
    for (const entity of searchableEntities.slice(0, 2)) {
      const searchData = await this.apiCall(`/search/repositories?q=${encodeURIComponent(entity)}&sort=stars&per_page=3`);
      if (!searchData) continue;

      const items = (searchData as GitHubSearchResponse).items ?? [];
      for (const r of items) {
        results.push({
          source: `GitHub Search: ${r.full_name}`,
          sourceType: 'social',
          credibilityScore: 0.9,
          url: r.html_url ?? '',
          data: {
            fullName: r.full_name,
            stars: r.stargazers_count,
            forks: r.forks_count,
            language: r.language,
            description: r.description,
          },
          excerpt: this.buildRepoExcerpt(r),
          relevance: 0.6,
          freshness: this.repoFreshness(r.pushed_at),
          stance: 'neutral',
          retrievedAt: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async apiCall(path: string): Promise<unknown | null> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Veritas/2.0',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          this.logger.warn(`GitHub returned HTTP ${response.status} for ${path}`);
          return null;
        }
        return await response.json();
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`GitHub attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`GitHub fetch failed after 2 attempts: ${err}`);
        return null;
      }
    }
    return null;
  }

  private buildRepoExcerpt(r: GitHubRepo): string {
    const parts = [`${r.full_name}: ${r.stargazers_count ?? 0} stars, ${r.forks_count ?? 0} forks`];
    if (r.language) parts.push(`language: ${r.language}`);
    if (r.archived) parts.push('(archived)');
    if (r.description) parts.push(`— ${r.description.slice(0, 100)}`);
    return parts.join(', ');
  }

  private repoFreshness(pushedAt?: string): number {
    if (!pushedAt) return 0.5;
    const daysSincePush = (Date.now() - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePush < 7) return 1.0;
    if (daysSincePush < 30) return 0.8;
    if (daysSincePush < 90) return 0.6;
    if (daysSincePush < 365) return 0.4;
    return 0.2;
  }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface GitHubRepo {
  full_name?: string;
  html_url?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  language?: string;
  pushed_at?: string;
  created_at?: string;
  archived?: boolean;
  description?: string;
}

interface GitHubWeeklyActivity {
  total?: number;
  week?: number;
  days?: number[];
}

interface GitHubContributor {
  login?: string;
  contributions?: number;
}

interface GitHubSearchResponse {
  items?: GitHubRepo[];
}
