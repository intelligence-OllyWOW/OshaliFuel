/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontWeight: {
        thin: '100',
        extralight: '200',
        light: '300',
        normal: '400',
        medium: '500',
      },
      backdropBlur: {
        xs: '2px',
      },
      colors: {
        brand: {
          navy:         '#1B2B5E',
          'navy-light': '#243570',
          gold:         '#F5A623',
          'gold-light': '#F7B84B',
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.7)',
          DEFAULT: 'rgba(255, 255, 255, 0.5)',
          dark: 'rgba(255, 255, 255, 0.3)',
        },
      },
    },
  },
  plugins: [],
};
