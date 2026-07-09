'use client';

import { useMemo } from 'react';
import type { InvestigationResult, UserInvestigationResult } from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SocialGraphPanelProps {
  investigation: InvestigationResult | null;
  onSelectActor?: (handle: string) => void;
  onTriggerAnalysis?: () => void;
}

interface Connection {
  handle: string;
  platform: string;
  tier: 1 | 2 | 3;
  interactionCount: number;
  weight: number; // 0-1 normalized
}

interface UserNode {
  handle: string;
  platform: string;
  connections: Connection[];
}

interface CommunitySummary {
  communityCount: number;
  bridgeNodes: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#0ea5e9',
  reddit: '#FF4500',
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: '#E1306C',
  tiktok: '#a855f7',
  mastodon: '#6364FF',
  farcaster: '#8B5CF6',
  telegram: '#0088cc',
};

const TIER_STYLES: Record<number, { dotColor: string; textClass: string; label: string }> = {
  1: { dotColor: '#FF6B2B', textClass: 'text-[12px] font-bold', label: 'Direct' },
  2: { dotColor: '#0ea5e9', textClass: 'text-[12px]', label: 'Contextual' },
  3: { dotColor: '#555570', textClass: 'text-[11px]', label: 'Bridge' },
};

function getTierStyle(tier: Connection['tier']) {
  return TIER_STYLES[tier] ?? TIER_STYLES[3];
}

// ---------------------------------------------------------------------------
// Data derivation
// ---------------------------------------------------------------------------

function deriveGraph(investigation: InvestigationResult): {
  nodes: UserNode[];
  community: CommunitySummary;
} {
  const users = investigation.users ?? [];
  const clusters = investigation.coordination?.clusters ?? [];

  // Build a handle -> user map
  const userMap = new Map<string, UserInvestigationResult>();
  for (const u of users) {
    userMap.set(u.user.handle, u);
  }

  // Build adjacency from likelySource (direct connections)
  const directLinks = new Map<string, Set<string>>();
  for (const u of users) {
    if (u.likelySource && userMap.has(u.likelySource)) {
      let userLinks = directLinks.get(u.user.handle);
      if (!userLinks) {
        userLinks = new Set();
        directLinks.set(u.user.handle, userLinks);
      }
      userLinks.add(u.likelySource);
      // Bidirectional awareness
      let sourceLinks = directLinks.get(u.likelySource);
      if (!sourceLinks) {
        sourceLinks = new Set();
        directLinks.set(u.likelySource, sourceLinks);
      }
      sourceLinks.add(u.user.handle);
    }
  }

  // Build cluster membership
  const clusterMembership = new Map<string, number[]>();
  clusters.forEach((cluster, clusterIdx) => {
    for (const handle of cluster.users) {
      const memberships = clusterMembership.get(handle) ?? [];
      memberships.push(clusterIdx);
      clusterMembership.set(handle, memberships);
    }
  });

  // Identify bridge nodes: users in multiple clusters
  const bridgeNodes: string[] = [];
  for (const [handle, memberOf] of clusterMembership) {
    if (memberOf.length > 1) bridgeNodes.push(handle);
  }

  // Compute max influence for normalization
  const maxInfluence = Math.max(1, ...users.map((u) => u.influenceScore));

  // Build connections for each user
  const nodeList: UserNode[] = [];

  for (const u of users) {
    const connections: Connection[] = [];
    const seen = new Set<string>();

    // Tier 1: Direct links (likelySource chain)
    const direct = directLinks.get(u.user.handle) ?? new Set();
    for (const targetHandle of direct) {
      if (seen.has(targetHandle)) continue;
      seen.add(targetHandle);
      const target = userMap.get(targetHandle);
      if (!target) continue;
      connections.push({
        handle: targetHandle,
        platform: target.user.platform,
        tier: 1,
        interactionCount: Math.max(1, Math.round(target.influenceScore * 10)),
        weight: target.influenceScore / maxInfluence,
      });
    }

    // Tier 2: Same cluster members (contextual)
    const userClusters = clusterMembership.get(u.user.handle) ?? [];
    for (const clusterIdx of userClusters) {
      const cluster = clusters[clusterIdx];
      if (!cluster) continue;
      for (const memberHandle of cluster.users) {
        if (memberHandle === u.user.handle || seen.has(memberHandle)) continue;
        seen.add(memberHandle);
        const member = userMap.get(memberHandle);
        if (!member) continue;
        connections.push({
          handle: memberHandle,
          platform: member.user.platform,
          tier: 2,
          interactionCount: Math.max(1, Math.round(cluster.confidence * 5)),
          weight: cluster.confidence,
        });
      }
    }

    // Tier 3: Bridge connections (users in overlapping clusters)
    for (const bridge of bridgeNodes) {
      if (bridge === u.user.handle || seen.has(bridge)) continue;
      // Only add if this bridge shares a cluster with the user
      const bridgeClusters = clusterMembership.get(bridge) ?? [];
      const hasOverlap = bridgeClusters.some((bc) => userClusters.includes(bc));
      if (!hasOverlap) continue;
      seen.add(bridge);
      const bridgeUser = userMap.get(bridge);
      if (!bridgeUser) continue;
      connections.push({
        handle: bridge,
        platform: bridgeUser.user.platform,
        tier: 3,
        interactionCount: 1,
        weight: bridgeUser.influenceScore / maxInfluence,
      });
    }

    // Sort: tier 1 first, then by weight descending
    connections.sort((a, b) => a.tier - b.tier || b.weight - a.weight);

    if (connections.length > 0) {
      nodeList.push({
        handle: u.user.handle,
        platform: u.user.platform,
        connections,
      });
    }
  }

  // Sort nodes by total connections descending
  nodeList.sort((a, b) => b.connections.length - a.connections.length);

  return {
    nodes: nodeList,
    community: {
      communityCount: clusters.length,
      bridgeNodes,
    },
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectionRow({
  connection,
  onSelect,
}: {
  connection: Connection;
  onSelect?: (handle: string) => void;
}) {
  const tierStyle = getTierStyle(connection.tier);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(connection.handle)}
      className="w-full flex items-center gap-2 px-2 py-1 hover:bg-nerv-bg-elevated/40 transition-colors rounded-sm group"
    >
      {/* Tier dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: tierStyle.dotColor }}
      />

      {/* Handle */}
      <span
        className={`font-mono text-nerv-text-secondary group-hover:text-nerv-text transition-colors truncate flex-1 text-left ${tierStyle.textClass}`}
      >
        @{connection.handle}
      </span>

      {/* Platform badge */}
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          backgroundColor: PLATFORM_COLORS[connection.platform.toLowerCase()] ?? '#888',
        }}
      />
      <span className="text-[10px] font-mono text-nerv-text-muted uppercase shrink-0 w-12 text-left">
        {connection.platform.slice(0, 6)}
      </span>

      {/* Interaction count */}
      <span className="text-[11px] font-mono tabular-nums text-nerv-text-muted shrink-0 w-6 text-right">
        {connection.interactionCount}
      </span>

      {/* Weight bar */}
      <div className="w-16 shrink-0">
        <NervBar value={connection.weight} color={tierStyle.dotColor} height={3} />
      </div>
    </button>
  );
}

function UserConnectionGroup({
  node,
  onSelectActor,
}: {
  node: UserNode;
  onSelectActor?: (handle: string) => void;
}) {
  const tierCounts = { 1: 0, 2: 0, 3: 0 };
  for (const c of node.connections) {
    tierCounts[c.tier]++;
  }

  return (
    <div className="border border-nerv-border rounded-sm">
      {/* User header */}
      <button
        type="button"
        onClick={() => onSelectActor?.(node.handle)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-nerv-bg-elevated/30 transition-colors"
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            backgroundColor: PLATFORM_COLORS[node.platform.toLowerCase()] ?? '#888',
          }}
        />
        <span className="text-[12px] font-mono font-bold text-nerv-text truncate flex-1 text-left">
          @{node.handle}
        </span>
        <div className="flex items-center gap-1">
          {tierCounts[1] > 0 && (
            <NervBadge label={`${tierCounts[1]}D`} variant="orange" size="sm" />
          )}
          {tierCounts[2] > 0 && <NervBadge label={`${tierCounts[2]}C`} variant="blue" size="sm" />}
          {tierCounts[3] > 0 && <NervBadge label={`${tierCounts[3]}B`} variant="muted" size="sm" />}
        </div>
      </button>

      {/* Connections grouped by tier */}
      <div className="px-1 pb-1">
        {([1, 2, 3] as const).map((tier) => {
          const tierConns = node.connections.filter((c) => c.tier === tier);
          if (tierConns.length === 0) return null;
          const style = getTierStyle(tier);
          return (
            <div key={tier}>
              <div className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted px-2 pt-1">
                {style.label} ({tierConns.length})
              </div>
              {tierConns.map((c) => (
                <ConnectionRow
                  key={`${c.handle}:${c.platform}:${c.tier}`}
                  connection={c}
                  onSelect={onSelectActor}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SocialGraphPanel({
  investigation,
  onSelectActor,
  onTriggerAnalysis,
}: SocialGraphPanelProps) {
  const graphData = useMemo(() => {
    if (!investigation) return null;
    return deriveGraph(investigation);
  }, [investigation]);

  if (!investigation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u25CE'}</div>
          <div className="text-[13px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
            SOCIAL GRAPH
          </div>
          <div className="text-[13px] font-mono text-nerv-text-secondary max-w-[320px] leading-relaxed">
            Run an investigation on a narrative to map social connections.
          </div>
          {onTriggerAnalysis && (
            <button
              type="button"
              onClick={onTriggerAnalysis}
              className="mt-4 px-4 py-2 text-[12px] font-mono uppercase tracking-wider border border-nerv-orange text-nerv-orange hover:bg-nerv-orange/10 rounded-sm transition-colors font-bold"
            >
              ANALYZE TOP NARRATIVE
            </button>
          )}
          <div className="text-[13px] font-mono text-nerv-orange mt-3 max-w-[320px] leading-relaxed">
            {'\u2192'} Select a narrative in the left panel, then click{' '}
            <span className="font-bold">INVESTIGATE THIS NARRATIVE</span> in the right panel.
          </div>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u25CE'}</div>
          <div className="text-[12px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
            NO CONNECTIONS FOUND
          </div>
          <div className="text-[12px] font-mono text-nerv-text-secondary max-w-[280px] leading-relaxed">
            Investigation completed but no social connections could be derived from the data.
          </div>
        </div>
      </div>
    );
  }

  const { nodes, community } = graphData;
  const totalConnections = nodes.reduce((s, n) => s + n.connections.length, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Community summary header */}
      <div className="shrink-0 px-3 py-2 border-b border-nerv-border bg-nerv-bg">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[12px] font-mono font-bold text-nerv-orange uppercase tracking-wider">
            Social Graph
          </span>
          <div className="flex items-center gap-2">
            <NervBadge label={`${community.communityCount} communities`} variant="blue" size="sm" />
            <NervBadge
              label={`${community.bridgeNodes.length} bridge nodes`}
              variant="amber"
              size="sm"
            />
            <NervBadge label={`${nodes.length} actors`} variant="muted" size="sm" />
            <NervBadge label={`${totalConnections} connections`} variant="muted" size="sm" />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
            TIERS:
          </span>
          {([1, 2, 3] as const).map((tier) => {
            const style = getTierStyle(tier);
            return (
              <span
                key={tier}
                className="flex items-center gap-1 text-[10px] font-mono text-nerv-text-muted"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: style.dotColor }}
                />
                {style.label}
              </span>
            );
          })}
        </div>

        {/* Bridge node callout */}
        {community.bridgeNodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-[10px] font-mono uppercase text-nerv-amber shrink-0">
              Bridges:
            </span>
            {community.bridgeNodes.map((handle) => (
              <button
                key={handle}
                type="button"
                onClick={() => onSelectActor?.(handle)}
                className="text-[10px] font-mono text-nerv-text-secondary hover:text-nerv-orange transition-colors"
              >
                @{handle}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Relationship list */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {nodes.map((node) => (
          <UserConnectionGroup key={node.handle} node={node} onSelectActor={onSelectActor} />
        ))}
      </div>
    </div>
  );
}
