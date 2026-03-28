/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Discord-inspired dark palette
        'ds-bg':        '#313338',  // основной фон (чат)
        'ds-sidebar':   '#2B2D31',  // боковая панель
        'ds-servers':   '#1E1F22',  // крайняя левая полоса (серверы)
        'ds-input':     '#383A40',  // поле ввода
        'ds-accent':    '#5865F2',  // акцентный цвет (blurple)
        'ds-green':     '#23A55A',  // онлайн / войти в голос
        'ds-red':       '#F23F42',  // выйти / ошибка
        'ds-yellow':    '#F0B232',  // ожидание
        'ds-text':      '#DBDEE1',  // основной текст
        'ds-muted':     '#949BA4',  // второстепенный текст
        'ds-hover':     '#35373C',  // hover-состояние
        'ds-active':    '#404249',  // выбранный элемент
        'ds-header':    '#2B2D31',  // шапка канала
        'ds-divider':   '#3A3C42',  // разделители
        'ds-mention':   '#444C6E',  // фон упоминания
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
      },
    },
  },
  plugins: [],
};
