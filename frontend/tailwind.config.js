import tailwindcssAnimate from 'tailwindcss-animate';

const color = (token) =>
  `color-mix(in srgb, var(--${token}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: color('border'),
        input: color('input'),
        ring: color('ring'),
        background: color('background'),
        foreground: color('foreground'),
        primary: {
          DEFAULT: color('primary'),
          foreground: color('primary-foreground'),
        },
        secondary: {
          DEFAULT: color('secondary'),
          foreground: color('secondary-foreground'),
        },
        destructive: {
          DEFAULT: color('destructive'),
          foreground: color('destructive-foreground'),
        },
        muted: {
          DEFAULT: color('muted'),
          foreground: color('muted-foreground'),
        },
        accent: {
          DEFAULT: color('accent'),
          foreground: color('accent-foreground'),
        },
        popover: {
          DEFAULT: color('popover'),
          foreground: color('popover-foreground'),
        },
        card: {
          DEFAULT: color('card'),
          foreground: color('card-foreground'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
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
  plugins: [tailwindcssAnimate],
};
