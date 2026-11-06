/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{ts,tsx}",
    "./shared/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--color-paper)",
        ink: "var(--color-ink)",
        accent: "var(--color-accent)",
        mute: "var(--color-mute)",
        line: "var(--color-line)",
        panel: "var(--color-panel)",
        warn: "var(--color-warn)",
        ok: "var(--color-ok)"
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"]
      },
      boxShadow: {
        panel: "0 14px 60px rgba(20, 19, 16, 0.08)"
      },
      letterSpacing: {
        punch: "-0.06em"
      }
    }
  },
  plugins: []
};
