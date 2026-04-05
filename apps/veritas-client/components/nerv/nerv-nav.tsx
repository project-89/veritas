'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchUnreadAlertCount } from '../../lib/api';
import { NervStatus } from './nerv-status';
import { NervBadge } from './nerv-badge';

const NAV_LINKS = [
  { href: '/monitor', label: 'Monitor' },
  { href: '/search', label: 'Search' },
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
    <span className="text-[10px] font-mono tabular-nums text-nerv-text-muted">
      {time} <span className="text-nerv-text-muted/60">UTC</span>
    </span>
  );
}

export function NervNav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

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

  const isInvestigating = pathname.startsWith('/investigate/') || pathname.startsWith('/results');

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="relative bg-nerv-bg border-b border-nerv-border">
      {/* Orange gradient bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-nerv-orange/40 to-transparent" />

      <div className="px-4 h-11 flex items-center justify-between gap-4">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <span className="text-[10px] font-mono text-nerv-orange/60 tracking-widest">
            {'//'}
          </span>
          <span className="text-sm font-mono font-bold tracking-[0.2em] text-nerv-text group-hover:text-nerv-orange transition-colors">
            VERITAS
          </span>
          <span className="text-[9px] font-mono text-nerv-text-muted tracking-wider hidden sm:inline">
            v2.0
          </span>
        </Link>

        {/* Center: Navigation + breadcrumb */}
        <div className="flex items-center gap-1">
          {isInvestigating && (
            <Link
              href="/monitor"
              className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted hover:text-nerv-orange transition-colors"
            >
              {'\u2190'} Monitor
            </Link>
          )}
          {isInvestigating && (
            <span className="text-[10px] font-mono text-nerv-orange/60 px-1">{'\u25B8'}</span>
          )}
          {isInvestigating && (
            <span className="text-[10px] font-mono text-nerv-orange uppercase tracking-wider">
              Investigation
            </span>
          )}
          {!isInvestigating ? NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  'relative px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors rounded-sm',
                  active
                    ? 'text-nerv-orange bg-nerv-orange/10'
                    : 'text-nerv-text-muted hover:text-nerv-text-secondary hover:bg-nerv-bg-panel/50',
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

        {/* Right: System status + time */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <NervStatus status="online" size="sm" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
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
