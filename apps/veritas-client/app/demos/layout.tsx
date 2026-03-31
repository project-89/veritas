import Link from 'next/link';

const demoLinks = [
  { href: '/demos/all', label: 'All Visualizations' },
  { href: '/demos/network', label: 'Network Graph' },
  { href: '/demos/reality-tunnel', label: 'Reality Tunnel' },
  { href: '/demos/temporal', label: 'Temporal Narrative' },
  { href: '/demos/mycelium', label: 'Narrative Mycelium' },
  { href: '/demos/landscape', label: 'Narrative Landscape' },
  { href: '/demos/enhanced-tunnel', label: 'Enhanced Tunnel' },
  { href: '/demos/narrative-flow', label: 'Narrative Flow' },
];

export default function DemosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-slate-900/50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 py-2 overflow-x-auto">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">Demos:</span>
            {demoLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-slate-400 hover:text-indigo-300 whitespace-nowrap transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
