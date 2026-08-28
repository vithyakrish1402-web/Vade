/** @type {import('tailwindcss').Config} */

/*
 * Vade — the design tokens from client/src/index.css, surfaced as Tailwind names.
 *
 * Colors resolve to CSS variables so a single `.dark` class on <html> reskins the whole
 * app. That means the `/opacity` modifier does not work on these names — where a tint is
 * needed, use the token that already carries it (accent-tint, warn-tint, line).
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--v-bg)',
        surface: 'var(--v-surface)',
        'surface-2': 'var(--v-surface-2)',
        text: 'var(--v-text)',
        muted: 'var(--v-muted)',
        faint: 'var(--v-faint)',
        line: 'var(--v-line)',
        accent: 'var(--v-accent)',
        'accent-ink': 'var(--v-accent-ink)',
        'accent-tint': 'var(--v-accent-tint)',
        warn: 'var(--v-warn)',
        'warn-tint': 'var(--v-warn-tint)',
        'out-bg': 'var(--v-out-bg)',
        'out-fg': 'var(--v-out-fg)',
        scrim: 'var(--v-scrim)',
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // The spec's type roles, each carrying its own size / line-height / tracking.
      fontSize: {
        title: ['30px', { lineHeight: '1.1', letterSpacing: '-0.026em' }],
        'title-lg': ['38px', { lineHeight: '1.05', letterSpacing: '-0.032em' }],
        'title-sm': ['24px', { lineHeight: '1.2', letterSpacing: '-0.022em' }],
        sheet: ['21px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        name: ['15.5px', { lineHeight: '1.2', letterSpacing: '-0.012em' }],
        message: ['15px', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        plain: ['15px', { lineHeight: '1.5' }],
        row: ['13px', { lineHeight: '1.4' }],
        meta: ['11.5px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        label: ['11px', { lineHeight: '1.4', letterSpacing: '0.09em' }],
      },
      // 4 · icon gap, 9 · stack, 13 · row, 18 · gutter, 26 · section, 35 · screen.
      spacing: {
        gap: '4px',
        stack: '9px',
        row: '13px',
        gutter: '18px',
        section: '26px',
        screen: '35px',
      },
      borderRadius: {
        card: '20px',
        sheet: '30px',
        dialog: '26px',
        bubble: '22px',
        tail: '7px',
        pad: '34px',
      },
      boxShadow: {
        float: 'var(--v-shadow)',
        fab: '0 8px 20px rgba(0, 0, 0, 0.22)',
        dialog: '0 20px 50px rgba(0, 0, 0, 0.3)',
      },
      transitionTimingFunction: {
        sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};
