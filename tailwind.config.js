/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'ds-bg':        'var(--ds-bg)',
        'ds-sidebar':   'var(--ds-sidebar)',
        'ds-servers':   'var(--ds-servers)',
        'ds-input':     'var(--ds-input)',
        'ds-accent':    '#00f0ff',  // Акцент оставляем циановым (он хорошо смотрится везде)
        'ds-accent-glow':'rgba(0, 240, 255, 0.4)',
        'ds-green':     '#23A55A',
        'ds-red':       '#F23F42',
        'ds-yellow':    '#F0B232',
        'ds-text':      'var(--ds-text)',
        'ds-muted':     'var(--ds-muted)',
        'ds-hover':     'var(--ds-hover)',
        'ds-active':    'var(--ds-active)',
        'ds-header':    'var(--ds-header)',
        'ds-divider':   'var(--ds-divider)',
        'ds-mention':   'var(--ds-mention)',
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
