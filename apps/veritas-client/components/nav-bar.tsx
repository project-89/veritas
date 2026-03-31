'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/', label: 'Home', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
  { href: '/search', label: 'Live Analysis', activeColor: 'text-indigo-600 border-b-2 border-indigo-600', inactiveColor: 'text-indigo-500 hover:text-indigo-700 font-semibold' },
  { href: '/network', label: 'Network Graph', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
  { href: '/reality-tunnel', label: 'Reality Tunnel', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
  { href: '/temporal', label: 'Temporal Narrative', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
  { href: '/mycelium', label: 'Narrative Mycelium', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
  { href: '/landscape', label: 'Narrative Landscape', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
  { href: '/enhanced-tunnel', label: 'Enhanced Reality Tunnel', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
  { href: '/narrative-flow', label: 'Narrative Flow', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
  { href: '/demo', label: 'All Visualizations', activeColor: 'text-blue-600 border-b-2 border-blue-600', inactiveColor: 'text-gray-500 hover:text-gray-700' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8 py-4 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${
                pathname === link.href ? link.activeColor : link.inactiveColor
              } px-3 py-2 text-sm font-medium whitespace-nowrap`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
