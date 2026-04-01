import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        teal: {
          50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4",
          300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6",
          600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a",
        },
        docya: {
          primary: "#0AE6C7",
          secondary: "#00A6CE",
          bg: "#030b12",
          surface: "#060f1a",
        },
      },
      fontFamily: { outfit: ["Outfit", "sans-serif"] },
      backdropBlur: { xs: "2px" },
      boxShadow: {
        glow: "0 0 20px rgba(10,230,199,0.3)",
        "glow-lg": "0 0 40px rgba(10,230,199,0.4)",
      },
      borderRadius: { xl: "1rem", "2xl": "1.5rem", "3xl": "2rem" },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-up": "fadeInUp 0.6s ease forwards",
      },
    },
  },
  plugins: [],
};
export default config;
