import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1B3A5C',
        'navy-light': '#2A5280',
        blue: '#3B7EC8',
        'blue-light': '#5B9FE8',
        sky: '#EBF4FF',
        'sky-2': '#F5F9FF',
        cream: '#FAFCFF',
        muted: '#6B8299',
        gold: '#C9A96E',
        'gold-light': '#E8D5B0',
        'dark-3': '#1E1E1E',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
