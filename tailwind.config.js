/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EFF4FF',
          100: '#E0EAFF',
          200: '#C7D7FD',
          300: '#A4BCFC',
          400: '#8098F9',
          500: '#6172F3',
          600: '#444CE7',
          700: '#3538CD',
          800: '#2D31A6',
          900: '#2D3282',
        },
        navy: {
          50: '#d0dcfb',
          100: '#aac0fe',
          200: '#a3b9f8',
          300: '#728fea',
          400: '#3652ba',
          500: '#1b3bbb',
          600: '#24388a',
          700: '#1B254B',
          800: '#111c44',
          900: '#0b1437',
        },
        gray: {
          50: '#f8f9fa',
          100: '#f0f1f3',
          200: '#e9edf7',
          300: '#cbd5e0',
          400: '#a0aec0',
          500: '#718096',
          600: '#4a5568',
          700: '#2d3748',
          800: '#1a202c',
          900: '#171923',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        card: '0px 18px 40px rgba(112, 144, 176, 0.12)',
        'card-dark': '0px 18px 40px rgba(0, 0, 0, 0.3)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-8px)' },
          '75%': { transform: 'translateX(8px)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
        shake: 'shake 0.4s ease',
        'fade-in': 'fade-in 0.3s ease',
      },
    },
  },
  plugins: [],
}
