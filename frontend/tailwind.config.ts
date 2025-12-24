import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f5ff",
          100: "#e0ebff",
          200: "#c7d9ff",
          300: "#a3c0ff",
          400: "#7a9dff",
          500: "#5a7cff",
          600: "#4361ee",
          700: "#3651d4",
          800: "#2f44ab",
          900: "#2c3e87",
        },
        feishu: {
          blue: "#3370ff",
          purple: "#7c3aed",
          gradient: {
            start: "#667eea",
            end: "#764ba2",
          },
        },
      },
      fontFamily: {
        sans: [
          "PingFang SC",
          "Microsoft YaHei",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "bounce-gentle": "bounceGentle 1s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        bounceGentle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;



