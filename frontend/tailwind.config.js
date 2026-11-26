/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Anton', 'Impact', 'sans-serif-condensed', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          teal: '#00715D',
          tealHover: '#005D4C',
          cream: '#FFFCE9',
          dark: '#111111',
          inputBg: '#FCFCFC',
          inputBorder: '#D6D6D6',
        },
      },
    },
  },
  plugins: [],
};
