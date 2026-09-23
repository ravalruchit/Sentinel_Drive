/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sentinel: {
          bg: '#0a0e1a',
          card: '#111827',
          border: '#1f2937',
          accent: '#00d4ff',
          green: '#00ff88',
          red: '#ff3b3b',
          yellow: '#ffd700',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      }
    }
  },
  plugins: []
}
