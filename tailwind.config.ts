import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F6F7F9',
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F9FAFB',
        },
        border: {
          DEFAULT: '#E5E7EB',
          strong: '#D0D5DD',
        },
        primary: {
          DEFAULT: '#1570EF',
          hover: '#175CD3',
          foreground: '#FFFFFF',
          subtle: '#EFF8FF',
        },
        success: {
          DEFAULT: '#12B76A',
          bg: '#ECFDF3',
          foreground: '#027A48',
        },
        warning: {
          DEFAULT: '#F79009',
          bg: '#FFFAEB',
          foreground: '#B54708',
        },
        danger: {
          DEFAULT: '#F04438',
          bg: '#FEF3F2',
          foreground: '#B42318',
        },
        info: {
          DEFAULT: '#2E90FA',
          bg: '#EFF8FF',
          foreground: '#175CD3',
        },
        // Text palette (accessible via text-text-primary etc.)
        text: {
          primary: '#111827',
          secondary: '#667085',
          muted: '#98A2B3',
        },
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '10px',
        md: '10px',
        lg: '14px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(16,24,40,0.05)',
        DEFAULT: '0 4px 12px rgba(16,24,40,0.08)',
        md: '0 4px 12px rgba(16,24,40,0.08)',
        lg: '0 8px 24px rgba(16,24,40,0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        // Financial display sizes
        'financial-sm': ['22px', { lineHeight: '28px', fontWeight: '600' }],
        'financial-md': ['28px', { lineHeight: '34px', fontWeight: '700' }],
        'financial-lg': ['36px', { lineHeight: '44px', fontWeight: '700' }],
      },
      spacing: {
        // 8px grid system
        '18': '4.5rem',   // 72px
        '22': '5.5rem',   // 88px
      },
      animation: {
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
      },
      keyframes: {
        skeleton: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
