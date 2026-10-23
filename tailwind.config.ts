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
        sans: ["Inter", "Segoe UI", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        slate: {
          50: "#F5F8F8", 100: "#EBF1F0", 200: "#D8E3E1", 300: "#C0D0CD",
          400: "#8EA39F", 500: "#647A76", 600: "#4A625E", 700: "#384F4C",
          800: "#293E3D", 900: "#1E3232", 950: "#122221",
        },
        lime: {
          50: "#EFF7F3", 100: "#DDEDE5", 200: "#BDD9C8", 300: "#93C2A3",
          400: "#69A87D", 500: "#458B63", 600: "#32724F", 700: "#275D41",
          800: "#214A36", 900: "#1B392B", 950: "#10251C",
        },
        cyan: {
          50: "#EDF7F6", 100: "#D9EFEC", 200: "#B4DDD6", 300: "#89C7BB",
          400: "#5DAB9D", 500: "#398C81", 600: "#287369", 700: "#205C55",
          800: "#194943", 900: "#153A36", 950: "#0B2420",
        },
        pink: {
          50: "#FBF4F1", 100: "#F4E6E0", 200: "#E9CBBE", 300: "#D8A894",
          400: "#C68A71", 500: "#AA6E56", 600: "#8D5845", 700: "#704638",
          800: "#59392F", 900: "#482E27", 950: "#2E1D19",
        },
        amber: {
          50: "#FAF7ED", 100: "#F3EBD0", 200: "#E8D7A8", 300: "#D8C17E",
          400: "#C5A95E", 500: "#A98D45", 600: "#876F37", 700: "#6E5B31",
          800: "#594A2B", 900: "#473C25", 950: "#2E2718",
        },
        orange: {
          50: "#FAF7ED", 100: "#F3EBD0", 200: "#E8D7A8", 300: "#D8C17E",
          400: "#C5A95E", 500: "#A98D45", 600: "#876F37", 700: "#6E5B31",
          800: "#594A2B", 900: "#473C25", 950: "#2E2718",
        },
        violet: {
          50: "#F2F6F7", 100: "#E6EEF0", 200: "#D1E0E3", 300: "#AEC9CE",
          400: "#85ABB2", 500: "#628D95", 600: "#4E727A", 700: "#3F5D64",
          800: "#334B51", 900: "#293D41", 950: "#19282A",
        },
        pastels: {
          cream: "#F2F6F5",
          peach: "#DCEDE7",
          peachSoft: "#EEF4F2",
          mint: "#DCEFE8",
          mintSoft: "#E3F1ED",
          lavender: "#DDE9EF",
          lavenderSoft: "#EEF4F6",
          butter: "#F4F0E3",
          butterSoft: "#F4F0E3",
          warmDark: "#172E2A",
          warmMuted: "#536B65",
        },
        obsidian: {
          950: "#111F1F",
          900: "#172927",
          850: "#1B2E2D",
          800: "#203333",
          700: "#29413E",
        },
      },
    },
  },
  plugins: [],
};

export default config;
