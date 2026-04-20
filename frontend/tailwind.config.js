/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0d1117",
        surface: "#161b22",
        primary: "#58a6ff",
        danger: "#f85149",
        warning: "#d29922",
        success: "#2ea043"
      }
    },
  },
  plugins: [],
}
