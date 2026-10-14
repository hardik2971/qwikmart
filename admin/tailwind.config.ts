import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import defaultTheme from 'tailwindcss/defaultTheme';

// Ported 1:1 from backend/tailwind.config.js so the Next.js panels look identical to the Laravel ones.
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  safelist: [
    { pattern: /(bg|text|border)-(blue|green|emerald|orange|amber|red|rose|purple|violet|sky|cyan|teal|pink|indigo|gray|slate|yellow|lime)-(50|100|200|500|600|700)/ },
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-jakarta)', '"Plus Jakarta Sans"', ...defaultTheme.fontFamily.sans] },
      colors: {
        primary: { DEFAULT: '#0E9623', dark: '#0B7A1C', 50: '#E6F4E9', 100: '#CDEAD3', 600: '#0E9623', 700: '#0B7A1C' },
        adminbg: '#F2F7FF',
        navy: '#25396F',
        muted: '#7C8DB5',
        bodytext: '#344054',
        line: '#E6EAF2',
        dark: { bg: '#0F172A', card: '#1E293B', line: '#334155' },
      },
      borderRadius: { card: '12px' },
      boxShadow: { soft: '0 1px 2px rgba(16,24,40,.05)', card: '0 1px 3px rgba(16,24,40,.06)' },
    },
  },
  plugins: [forms],
};
export default config;
