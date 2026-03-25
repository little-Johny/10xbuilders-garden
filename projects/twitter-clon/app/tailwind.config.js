/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Nombres planos: evitan choque con la utilidad core `border-x` (p. ej. `border-x-border`).
        xline: '#2f3336',
        xblue: '#1d9bf0',
        x: {
          black: '#000000',
          text: '#e7e9ea',
          secondary: '#71767b',
          'border-light': '#536471',
          hover: 'rgba(231, 233, 234, 0.1)',
          'hover-strong': 'rgba(231, 233, 234, 0.15)',
          input: '#16181c',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        x: '0 0 15px rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
}
