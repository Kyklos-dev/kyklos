/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      colors: {
        /* Day mode: warm canvas + paper cards (not stark white everywhere) */
        surface: {
          0: "#f0eeeb",
          1: "#faf9f7",
          2: "#f3f1ed",
          3: "#d4cfc8",
        },
        accent: { DEFAULT: "#4338ca", dim: "#3730a3" },
        success: "#15803d",
        danger: "#b91c1c",
        warning: "#b45309",
        muted: "#6b6560",
      },
      boxShadow: {
        ky: "0 1px 2px rgba(41, 37, 36, 0.05), 0 4px 12px rgba(41, 37, 36, 0.06), inset 0 1px 0 rgba(255,255,255,0.65)",
        "ky-lg": "0 2px 4px rgba(41, 37, 36, 0.04), 0 12px 32px rgba(41, 37, 36, 0.08)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up-fade": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "modal-in": {
          "0%": { opacity: "0", transform: "scale(0.97) translateY(6px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out forwards",
        "slide-up-fade": "slide-up-fade 0.4s ease-out backwards",
        "modal-in": "modal-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        shimmer: "shimmer 1.2s ease-in-out infinite",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};


