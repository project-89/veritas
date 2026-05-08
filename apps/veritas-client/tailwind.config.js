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
          'bg-deep': 'rgb(var(--nerv-bg-deep) / <alpha-value>)',
          bg: 'rgb(var(--nerv-bg) / <alpha-value>)',
          'bg-panel': 'rgb(var(--nerv-bg-panel) / <alpha-value>)',
          'bg-elevated': 'rgb(var(--nerv-bg-elevated) / <alpha-value>)',
          border: 'rgb(var(--nerv-border) / <alpha-value>)',
          'border-active': 'rgb(var(--nerv-border-active) / <alpha-value>)',
          text: 'rgb(var(--nerv-text) / <alpha-value>)',
          'text-secondary': 'rgb(var(--nerv-text-secondary) / <alpha-value>)',
          'text-muted': 'rgb(var(--nerv-text-muted) / <alpha-value>)',
          orange: 'rgb(var(--nerv-orange) / <alpha-value>)',
          green: 'rgb(var(--nerv-green) / <alpha-value>)',
          red: 'rgb(var(--nerv-red) / <alpha-value>)',
          blue: 'rgb(var(--nerv-blue) / <alpha-value>)',
          amber: 'rgb(var(--nerv-amber) / <alpha-value>)',
          purple: 'rgb(var(--nerv-purple) / <alpha-value>)',
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
            boxShadow: '0 0 12px var(--nerv-glow-color, #e94560), 0 0 24px rgba(233,69,96,0.3)',
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
