/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [__dirname + "/index.html", __dirname + "/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f4f1eb",
        panel: "#fbf9f5",
        ink: "#15120f",
        mute: "#6f685f",
        line: "rgba(21, 18, 15, 0.12)",
        accent: "#ff6a3d",
        night: "#1b1815"
      }
    }
  },
  plugins: []
};
