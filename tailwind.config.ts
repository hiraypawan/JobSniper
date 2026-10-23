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
          50: "#F5F8F5", 100: "#ECF1ED", 200: "#D9E3DC", 300: "#C0CEC4",
          400: "#91A297", 500: "#66786C", 600: "#4F6156", 700: "#3C4C42",
          800: "#2B3930", 900: "#202C24", 950: "#141D17",
        },
        lime: {
          50: "#F2F7F2", 100: "#E5EFE7", 200: "#CEE0D1", 300: "#B0CCB5",
          400: "#89B292", 500: "#63936E", 600: "#4D7657", 700: "#3D6047",
          800: "#304C39", 900: "#253B2D", 950: "#19291F",
        },
        cyan: {
          50: "#F1F7F6", 100: "#E3EFED", 200: "#CADFDB", 300: "#A9C9C4",
          400: "#83AEA7", 500: "#638E87", 600: "#4E746E", 700: "#3E5D59",
          800: "#304A47", 900: "#263B38", 950: "#192825",
        },
        pink: {
          50: "#FBF5F2", 100: "#F4E9E3", 200: "#E9D2C7", 300: "#D7B2A3",
          400: "#C5927F", 500: "#A87561", 600: "#875D4D", 700: "#6D4B3E",
          800: "#583D33", 900: "#463128", 950: "#2D201A",
        },
        amber: {
          50: "#FAF7EE", 100: "#F3EEDC", 200: "#E8DDBA", 300: "#D7C58E",
          400: "#C2AA68", 500: "#A78E51", 600: "#867241", 700: "#6B5C37",
          800: "#574B2F", 900: "#453C28", 950: "#2D271A",
        },
        orange: {
          50: "#FAF7EE", 100: "#F3EEDC", 200: "#E8DDBA", 300: "#D7C58E",
          400: "#C2AA68", 500: "#A78E51", 600: "#867241", 700: "#6B5C37",
          800: "#574B2F", 900: "#453C28", 950: "#2D271A",
        },
        violet: {
          50: "#F3F6F3", 100: "#E8EEE9", 200: "#D6E1D8", 300: "#B9CBBE",
          400: "#91AA98", 500: "#6D8974", 600: "#566F5D", 700: "#435A4A",
          800: "#35483B", 900: "#29392E", 950: "#1B271F",
        },
        pastels: {
          cream: "#F3F6F3",
          peach: "#E1ECE3",
          peachSoft: "#F0F4F1",
          mint: "#DDEBE0",
          mintSoft: "#E8F1E9",
          lavender: "#E3EBE6",
          lavenderSoft: "#F0F4F1",
          butter: "#F3F1E8",
          butterSoft: "#F3F1E8",
          warmDark: "#25352C",
          warmMuted: "#53665B",
        },
        obsidian: {
          950: "#141D17",
          900: "#1B271F",
          850: "#202E25",
          800: "#26362C",
          700: "#34463A",
        },
      },
    },
  },
  plugins: [],
};

export default config;
