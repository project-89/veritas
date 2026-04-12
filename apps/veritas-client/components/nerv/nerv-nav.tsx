'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchUnreadAlertCount } from '../../lib/api';
import { prefetchRecentEvents } from '../../lib/use-event-stream';
import { NervStatus } from './nerv-status';
import { NervBadge } from './nerv-badge';

const NAV_LINKS = [
  { href: '/monitor', label: 'Monitor' },
  { href: '/search', label: 'Search' },
  { href: '/worldmap', label: 'World Map' },
] as const;

function UtcClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toISOString().slice(11, 19),
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-[11px] font-mono tabular-nums text-nerv-text-secondary">
      {time} <span className="text-nerv-text-muted/80">UTC</span>
    </span>
  );
}

function useTheme() {
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('nerv-theme') as 'dark' | 'light' | null;
    const initial = stored ?? 'dark';
    setThemeState(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const setTheme = (t: 'dark' | 'light') => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('nerv-theme', t);
  };

  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}

export function NervNav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    let mounted = true;
    const poll = () => {
      fetchUnreadAlertCount()
        .then((count) => {
          if (mounted) setUnreadCount(count);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const idleHandle = window.setTimeout(() => {
      if (!cancelled) {
        void prefetchRecentEvents();
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(idleHandle);
    };
  }, []);

  const isInvestigating = pathname.startsWith('/investigate/') || pathname.startsWith('/results');

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="relative bg-nerv-bg border-b border-nerv-border">
      {/* Orange gradient bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-nerv-orange/40 to-transparent" />

      <div className="px-4 h-12 flex items-center justify-between gap-4">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <span className="text-[11px] font-mono text-nerv-orange/75 tracking-widest">
            {'//'}
          </span>
          <span className="text-base font-mono font-bold tracking-[0.22em] text-nerv-text group-hover:text-nerv-orange transition-colors">
            VERITAS
          </span>
          <span className="text-[10px] font-mono text-nerv-text-secondary/75 tracking-wider hidden sm:inline">
            v2.0
          </span>
        </Link>

        {/* Center: Navigation + breadcrumb */}
        <div className="flex items-center gap-1">
          {isInvestigating && (
            <Link
              href="/monitor"
              className="px-2 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-nerv-text-secondary hover:text-nerv-orange transition-colors"
            >
              {'\u2190'} Monitor
            </Link>
          )}
          {isInvestigating && (
            <span className="text-[11px] font-mono text-nerv-orange/70 px-1">{'\u25B8'}</span>
          )}
          {isInvestigating && (
            <span className="text-[11px] font-mono text-nerv-orange uppercase tracking-[0.18em]">
              Investigation
            </span>
          )}
          {!isInvestigating ? NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onMouseEnter={link.href === '/worldmap' ? () => { void prefetchRecentEvents(); } : undefined}
                className={[
                  'relative px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors rounded-sm',
                  active
                    ? 'text-nerv-orange bg-nerv-orange/14 shadow-[0_0_14px_rgba(255,133,61,0.14)]'
                    : 'text-nerv-text-secondary hover:text-nerv-text hover:bg-nerv-bg-panel/70',
                ].join(' ')}
              >
                {link.label}
                {link.href === '/monitor' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1">
                    <NervBadge
                      label={unreadCount > 99 ? '99+' : String(unreadCount)}
                      variant="red"
                      size="sm"
                      pulse
                    />
                  </span>
                )}
              </Link>
            );
          }) : null}
        </div>

        {/* Right: Theme toggle + System status + time */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={toggleTheme}
            className="text-base px-2 py-1 rounded-sm transition-all text-nerv-text-secondary hover:text-nerv-orange hover:bg-nerv-bg-panel/50"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '\u2600\uFE0F' : '\u{1F319}'}
          </button>
          <div className="w-px h-4 bg-nerv-border hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5">
            <NervStatus status="online" size="sm" />
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-nerv-text-secondary">
              SYS:ONLINE
            </span>
          </div>
          <div className="w-px h-4 bg-nerv-border hidden sm:block" />
          <UtcClock />
        </div>
      </div>
    </nav>
  );
}
