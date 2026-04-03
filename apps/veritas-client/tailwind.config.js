const { join } = require('path');
const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');

module.exports = {
  content: [
    join(__dirname, 'app/**/*.{ts,tsx,js,jsx}'),
    join(__dirname, 'components/**/*.{ts,tsx,js,jsx}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        nerv: {
          'bg-deep': '#0a0a0f',
          bg: '#0f0f1a',
          'bg-panel': '#1a1a2e',
          'bg-elevated': '#252540',
          border: '#2a2a45',
          'border-active': '#3a3a5f',
          text: '#e0e0e8',
          'text-secondary': '#8888a0',
          'text-muted': '#555570',
          orange: '#FF6B2B',
          green: '#00FF41',
          red: '#e94560',
          blue: '#0ea5e9',
          amber: '#f59e0b',
          purple: '#a855f7',
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
