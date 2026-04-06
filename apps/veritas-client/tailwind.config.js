const { join } = require('path');
const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');

module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    join(__dirname, 'app/**/*.{ts,tsx,js,jsx}'),
    join(__dirname, 'components/**/*.{ts,tsx,js,jsx}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        nerv: {
          'bg-deep': 'var(--nerv-bg-deep)',
          bg: 'var(--nerv-bg)',
          'bg-panel': 'var(--nerv-bg-panel)',
          'bg-elevated': 'var(--nerv-bg-elevated)',
          border: 'var(--nerv-border)',
          'border-active': 'var(--nerv-border-active)',
          text: 'var(--nerv-text)',
          'text-secondary': 'var(--nerv-text-secondary)',
          'text-muted': 'var(--nerv-text-muted)',
          orange: 'var(--nerv-orange)',
          green: 'var(--nerv-green)',
          red: 'var(--nerv-red)',
          blue: 'var(--nerv-blue)',
          amber: 'var(--nerv-amber)',
          purple: 'var(--nerv-purple)',
        },
      },
      fontFamily: {
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['var(--font-inter)', 'Inter', 'SF Pro Display', 'system-ui'],
      },
      animation: {
        'nerv-pulse': 'nerv-pulse 2s ease-in-out infinite',
        'nerv-pulse-fast': 'nerv-pulse 0.8s ease-in-out infinite',
        'nerv-glow': 'nerv-glow 2s ease-in-out infinite',
        'nerv-scan': 'nerv-scan 3s linear infinite',
        'nerv-ticker': 'nerv-ticker 60s linear infinite',
      },
      keyframes: {
        'nerv-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'nerv-glow': {
          '0%, 100%': {
            boxShadow: '0 0 4px var(--nerv-glow-color, #e94560)',
          },
          '50%': {
            boxShadow:
              '0 0 12px var(--nerv-glow-color, #e94560), 0 0 24px rgba(233,69,96,0.3)',
          },
        },
        'nerv-scan': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'nerv-ticker': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};
