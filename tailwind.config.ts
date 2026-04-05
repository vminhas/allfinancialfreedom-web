import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1B3A5C',
        'navy-light': '#2A5280',
        'navy-deep': '#142D48',
        blue: '#3B7EC8',
        'blue-light': '#5B9FE8',
        sky: '#EBF4FF',
        'sky-2': '#F5F9FF',
        cream: '#FAFCFF',
        muted: '#6B8299',
        gold: '#C9A96E',
        'gold-light': '#E8D5B0',
        'gold-dark': '#A8834A',
        platinum: '#E8E8E4',
        charcoal: '#2C2C2C',
        'dark-3': '#1E1E1E',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-up': 'fadeUp 0.6s ease forwards',
        'count-up': 'countUp 1.5s ease forwards',
        'shimmer': 'shimmer 2.5s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'gold-shimmer': 'linear-gradient(90deg, #C9A96E 25%, #E8D5B0 50%, #C9A96E 75%)',
        'navy-grad': 'linear-gradient(135deg, #142D48 0%, #1B3A5C 50%, #2A5280 100%)',
        'hero-overlay': 'linear-gradient(to bottom, rgba(20,45,72,0.75) 0%, rgba(27,58,92,0.85) 100%)',
      },
      boxShadow: {
        'premium': '0 8px 40px rgba(27,58,92,0.12)',
        'premium-lg': '0 16px 64px rgba(27,58,92,0.18)',
        'gold': '0 4px 24px rgba(201,169,110,0.25)',
      },
    },
  },
  plugins: [],
}
export default config
