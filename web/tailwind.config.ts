import type { Config } from 'tailwindcss';

// Design tokens from docs/SPEC.md §2. Neutral/surface colours are CSS variables so
// light/dark themes flip automatically (see globals.css).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', lg: '1.5rem' }, screens: { '2xl': '1320px' } },
    extend: {
      colors: {
        primary: { DEFAULT: '#0E9623', dark: '#0B7A1C', 50: '#E6F4E9', 100: '#CCE9D2' },
        navy: '#25396F',
        muted: v('muted'),
        body: v('body'),
        ink: v('ink'),
        line: v('line'),
        surface: v('surface'),
        page: v('page'),
        soft: v('soft'),
        info: '#3B82F6',
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        purple: '#8B5CF6',
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '12px', btn: '10px' },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,.05)',
        card: '0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)',
        pop: '0 12px 32px -8px rgba(16,24,40,.18)',
      },
      keyframes: {
        'slide-up': { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'slide-up': 'slide-up .25s ease-out',
        'fade-in': 'fade-in .2s ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
