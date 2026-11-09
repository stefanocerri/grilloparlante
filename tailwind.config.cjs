/** @type {import('tailwindcss').Config} */
const color = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./frontend/index.html", "./frontend/src/**/*.{ts,tsx}", "./shared/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: color("bg"),
        subtle: color("subtle"),
        ink: color("ink"),
        mute: color("mute"),
        faint: color("faint"),
        line: color("line"),
        accent: color("accent"),
        ok: color("ok"),
        warn: color("warn"),
        danger: color("danger")
      },
      fontFamily: {
        sans: ["Geist", "-apple-system", "BlinkMacSystemFont", "Helvetica Neue", "sans-serif"],
        mono: ["Geist Mono", "SF Mono", "Menlo", "monospace"]
      },
      fontSize: {
        "2xs": ["11px", "16px"],
        xs: ["12px", "16px"],
        sm: ["13px", "20px"],
        base: ["14px", "20px"]
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } }
      },
      animation: { "fade-in": "fade-in 180ms ease-out" }
    }
  },
  plugins: []
};
