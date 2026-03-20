/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        haze: "#eef2ff",
        ember: "#f97316",
        reef: "#0f766e",
        dusk: "#1e293b"
      },
      fontFamily: {
        display: ["Space Grotesk", "Trebuchet MS", "Segoe UI", "sans-serif"],
        body: ["Segoe UI", "Trebuchet MS", "sans-serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"]
      },
      boxShadow: {
        glow: "0 20px 60px rgba(15, 23, 42, 0.14)"
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(0, -10px, 0)" }
        },
        rise: {
          "0%": { opacity: "0", transform: "translate3d(0, 18px, 0)" },
          "100%": { opacity: "1", transform: "translate3d(0, 0, 0)" }
        }
      },
      animation: {
        drift: "drift 9s ease-in-out infinite",
        rise: "rise 500ms ease-out both"
      }
    }
  },
  plugins: []
};
