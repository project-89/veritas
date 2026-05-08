'use client';

import { useEffect, useState } from 'react';
import { fetchPluginManifest, type PluginManifest, type PluginManifestResponse } from './api';

let manifestCache: PluginManifestResponse | null = null;
let manifestInflight: Promise<PluginManifestResponse> | null = null;

export async function loadPluginManifest(): Promise<PluginManifestResponse> {
  if (manifestCache) return manifestCache;
  if (manifestInflight) return manifestInflight;

  manifestInflight = fetchPluginManifest()
    .then((result) => {
      manifestCache = result;
      return result;
    })
    .finally(() => {
      manifestInflight = null;
    });

  return manifestInflight;
}

export function usePluginManifest() {
  const [plugins, setPlugins] = useState<PluginManifest[]>(manifestCache?.plugins ?? []);
  const [loading, setLoading] = useState(!manifestCache);

  useEffect(() => {
    let cancelled = false;
    void loadPluginManifest()
      .then((result) => {
        if (!cancelled) {
          setPlugins(result.plugins);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { plugins, loading };
}

export function hasPluginCapability(plugins: PluginManifest[], capability: string): boolean {
  return plugins.some(
    (plugin) => plugin.status === 'installed' && plugin.capabilities.includes(capability),
  );
}

export function getTopNavItemsFromPlugins(plugins: PluginManifest[]) {
  return plugins
    .filter((plugin) => plugin.status === 'installed')
    .flatMap((plugin) => plugin.ui?.navItems ?? [])
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export function getPluginsForSlot(
  plugins: PluginManifest[],
  slot:
    | 'top-nav'
    | 'page-route'
    | 'results-tab'
    | 'investigation-panel'
    | 'identity-panel'
    | 'dossier-panel'
    | 'investigation-action'
    | 'monitor-card-action',
) {
  return plugins.filter(
    (plugin) => plugin.status === 'installed' && (plugin.ui?.slots ?? []).includes(slot),
  );
}
