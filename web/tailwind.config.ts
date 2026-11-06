import type { Config } from 'tailwindcss';

// Design tokens from docs/SPEC.md §2. Neutral/surface colours are CSS variables so
// light/dark themes flip automatically (see globals.css).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    // Content width steps: 960 → 1280 → 1536 → 1660 px, with 2.5rem side padding from 960 px up.
    container: {
      center: true,
      padding: { DEFAULT: '1rem', c960: '2.5rem' },
      screens: { c960: '960px', c1280: '1280px', c1536: '1536px', c1660: '1660px' },
    },
    extend: {
      colors: {
        // QwikMart brand (logo): royal blue for actions, orange for speed & savings, night navy for dark surfaces.
        primary: { DEFAULT: '#1846D1', dark: '#0F34A8', 50: '#EDF2FF', 100: '#D9E3FF' },
        accent: { DEFAULT: '#F26411', ink: '#C2410C', 50: '#FFF1E7', 100: '#FFE0CC' },
        night: { DEFAULT: '#0A1B4D', 2: '#132A6B' },
        fresh: '#15803D',
        navy: '#0A1B4D',
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
        display: ['var(--font-display)', 'var(--font-jakarta)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '16px', btn: '12px', hero: '28px' },
      boxShadow: {
        soft: '0 1px 2px rgba(10,27,77,.06)',
        card: '0 10px 30px -12px rgba(10,27,77,.22)',
        pop: '0 24px 48px -16px rgba(10,27,77,.35)',
        cta: '0 8px 20px -8px rgba(24,70,209,.55)',
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
