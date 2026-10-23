import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Quicksand",
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
        colors: {
        pastels: {
          cream: "#FFF8F0",
          peach: "#FFE4D6",
          peachSoft: "#FFF0EB",
          mint: "#E0F5E9",
          mintSoft: "#EBF8F1",
          lavender: "#EAE6FA",
          lavenderSoft: "#F3F0FF",
          butter: "#FFF5CC",
          butterSoft: "#FFFBE6",
          warmDark: "#5C4A42",
          warmMuted: "#A8988E",
        },
        obsidian: {
          950: "#080A0F",
          900: "#0D1117",
          850: "#121722",
          800: "#171E2C",
          700: "#222C40",
        },
      },
    },
  },
  plugins: [],
};

export default config;
