import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f0ff',
          100: '#e9e3ff',
          200: '#d4c6ff',
          300: '#b89aff',
          400: '#9a66ff',
          500: '#7c3aed',
          600: '#6C3DE8',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#2e1065',
        },
        pink: {
          500: '#E83D91',
          600: '#db2777',
        },
        surface: {
          50: '#f8f7ff',
          100: '#f0eeff',
          900: '#0A0A0F',
          800: '#12121A',
          700: '#1A1A2E',
          600: '#252540',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6C3DE8 0%, #E83D91 100%)',
        'dark-glass': 'linear-gradient(135deg, rgba(26,26,46,0.9) 0%, rgba(18,18,26,0.95) 100%)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
    },
  },
  plugins: [],
};

export default config;
