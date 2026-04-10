/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'ds-bg':        'rgb(var(--ds-bg) / <alpha-value>)',
        'ds-sidebar':   'rgb(var(--ds-sidebar) / <alpha-value>)',
        'ds-servers':   'rgb(var(--ds-servers) / <alpha-value>)',
        'ds-input':     'rgb(var(--ds-input) / <alpha-value>)',
        'ds-accent-rgb': 'var(--ds-accent-rgb)',
        'ds-accent':    'rgb(var(--ds-accent-rgb) / <alpha-value>)',
        'ds-accent-glow':'rgba(var(--ds-accent-rgb), 0.4)',
        'ds-green':     '#23A55A',
        'ds-red':       '#F23F42',
        'ds-yellow':    '#F0B232',
        'ds-text':      'rgb(var(--ds-text) / <alpha-value>)',
        'ds-muted':     'rgb(var(--ds-muted) / <alpha-value>)',
        'ds-hover':     'rgb(var(--ds-hover) / <alpha-value>)',
        'ds-active':    'rgb(var(--ds-active) / <alpha-value>)',
        'ds-header':    'rgb(var(--ds-header) / <alpha-value>)',
        'ds-divider':   'rgb(var(--ds-divider) / <alpha-value>)',
        'ds-border':    'rgb(var(--ds-divider) / <alpha-value>)',
        'ds-mention':   'rgb(var(--ds-mention) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'glow-move': 'glowMove 3s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1, filter: 'drop-shadow(0 0 4px #00f0ff)' }, '50%': { opacity: 0.7, filter: 'drop-shadow(0 0 12px #00f0ff)' } },
        glowMove: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' }
        }
      },
    },
  },
  plugins: [],
};
