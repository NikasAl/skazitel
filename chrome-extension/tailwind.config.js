/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Палитра Сказителя — тёплые, книжные тона
        parchment: '#f5f0e8',
        ink: '#1a1a2e',
        ember: '#c84b31',
        gold: '#d4a843',
        sage: '#588157',
        dusk: '#4a4e69',
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
