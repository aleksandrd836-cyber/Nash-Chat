/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Discord-inspired dark palette
        // "VIBE" Redesign Palette (Cyan/OLED)
        'ds-bg':        '#0b0c0e',  // основной глубокий фон
        'ds-sidebar':   '#161719',  // боковая панель
        'ds-servers':   '#050505',  // сервера (самый темный)
        'ds-input':     '#1e1f22',  // поле ввода
        'ds-accent':    '#00f0ff',  // основной циановый акцент
        'ds-accent-glow':'rgba(0, 240, 255, 0.4)',
        'ds-green':     '#23A55A',
        'ds-red':       '#F23F42',
        'ds-yellow':    '#F0B232',
        'ds-text':      '#FFFFFF',  // белый текст для контраста
        'ds-muted':     '#80848E',
        'ds-hover':     '#2a2b2f',
        'ds-active':    '#313338',
        'ds-header':    '#111214',
        'ds-divider':   '#2b2d31',
        'ds-mention':   '#444C6E',  // фон упоминания
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
