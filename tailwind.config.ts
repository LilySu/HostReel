import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.25rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        cream: {
          DEFAULT: '#FAF6EE',
          dark: '#F2EBDC',
        },
        sand: {
          DEFAULT: '#E8DFCB',
          light: '#F0E9D8',
        },
        gold: {
          DEFAULT: '#C8A876',
          dark: '#A88B5C',
        },
        charcoal: {
          DEFAULT: '#2A2723',
          light: '#5A554D',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
      },
      letterSpacing: {
        overline: '0.18em',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
