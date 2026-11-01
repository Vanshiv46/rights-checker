/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Civic palette: warm paper, deep ink, teal actions, a single saffron accent.
        paper: '#F8F7F2',
        ink: { DEFAULT: '#172B3A', soft: '#3E5160' },
        brand: { DEFAULT: '#147D72', dark: '#0E5C54', deep: '#0B4A44', tint: '#E7F2F0' },
        saffron: { DEFAULT: '#D99A32', tint: '#FBF1DF' },
        line: '#D9D6CC',
      },
    },
  },
  plugins: [],
};
