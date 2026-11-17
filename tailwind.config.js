/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        // —— 品牌主色：单一紫（主操作 / 选中 / 品牌）——
        brand: {
          50: '#F4F2FF',
          100: '#EBE8FF',
          200: '#D8D1FF',
          300: '#B9ACFF',
          400: '#9883FF',
          500: '#7C5CFF',
          600: '#6A45F0',
          700: '#5A37D6',
          800: '#4A2DB0',
          900: '#3B2687',
          950: '#221550',
        },
        // —— 中性墨色（文字 / 图标）——
        ink: {
          300: '#C7CCDA',
          400: '#9AA1B1',
          500: '#6B7180',
          700: '#3C414D',
          900: '#15171D',
        },
        // —— 面与线 ——
        canvas: '#F5F6F8',
        surface: {
          DEFAULT: '#FFFFFF',
          2: '#F8F9FC',
        },
        line: {
          DEFAULT: '#E7E9F0',
          soft: '#EFF1F6',
        },
        // —— 语义色（只表示状态 / 分值 / 红线）——
        ok: {
          DEFAULT: '#12B76A',
          bg: '#E8F8F0',
          ink: '#067A46',
          line: '#BFEBD4',
        },
        warn: {
          DEFAULT: '#F79009',
          bg: '#FEF4E6',
          ink: '#B54708',
          line: '#FAD9A8',
        },
        danger: {
          DEFAULT: '#F04438',
          bg: '#FEECEB',
          ink: '#B42318',
          line: '#F8C9C6',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,22,32,0.05), 0 10px 30px -14px rgba(20,22,32,0.14)',
        pop: '0 16px 48px -16px rgba(20,22,32,0.22)',
        btn: '0 6px 16px -6px rgba(106,69,240,0.45)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
