/** Design tokens from Design.md (TransOrg design system, section 3 and 15).
 * Brand: navy #0F3A58, blue #2568B2, cyan #4FC6DF, lime #93CA5B. Semantic colours only mean a status.
 * No purple anywhere. Older colour names used in the code (sky, teal, leaf, violet) are mapped onto the
 * system so every screen follows it: sky and teal become the brand blue family, leaf becomes success. */
const brand = { 50: "#EEF4FB", 100: "#DCE9F7", 200: "#BBD3EE", 300: "#8DB7E4", 400: "#5F98D6", 500: "#3A7CC9", 600: "#2568B2", 700: "#1C5392", 800: "#174477" };
const success = { 50: "#DEF5EC", 100: "#DEF5EC", 400: "#27B07A", 500: "#27B07A", 600: "#1F9D6B", 700: "#157A52" };

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 600: "#16486B", 700: "#16486B", 800: "#16486B", 900: "#0F3A58", 950: "#0A2A42" },
        brand,
        sky: brand,
        teal: brand,
        violet: brand,
        cyan: { 100: "#DDF4F9", 500: "#4FC6DF", 700: "#1B7F95" },
        lime: { 50: "#E9F4DC", 100: "#E9F4DC", 400: "#93CA5B", 500: "#93CA5B", 700: "#4E7A22" },
        leaf: success,
        success,
        ink: { 600: "#3B5166", 700: "#2A4256", 900: "#132B3F" },
        slate: { 300: "#B8C4CE", 400: "#8A9AA9", 500: "#5A6E80", 600: "#465B6E", 700: "#2A4256", 900: "#132B3F" },
        line: { 200: "#E4E9EE" },
        canvas: { 50: "#F9FBFC", 100: "#F3F6F9", 200: "#E4E9EE" },
        surface: { 0: "#FFFFFF", 50: "#F9FBFC" },
        info: { 100: "#E2EEFD", 500: "#4A93EF", 600: "#2E7BE0", 700: "#1F5FB8" },
        warn: { 100: "#FCEFD6", 300: "#F0A93D", 500: "#F0A93D", 600: "#E08A1E", 700: "#9C5E12" },
        danger: { 100: "#FCE4E3", 500: "#EC5B58", 600: "#E0413E", 700: "#B22E2C" },
      },
      fontFamily: { sans: ["Inter", "Helvetica Neue", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Arial", "sans-serif"] },
      boxShadow: {
        card: "0 1px 3px rgba(16,24,64,.04), 0 1px 2px rgba(16,24,64,.06)",
        raised: "0 8px 24px rgba(16,24,64,.10)",
        float: "0 24px 60px rgba(10,42,66,.28)",
      },
      borderRadius: { card: "14px", control: "9px", tile: "10px", panel: "12px", modal: "16px" },
      backgroundImage: { "navy-depth": "linear-gradient(160deg, #0F3A58 0%, #0A2A42 100%)" },
      maxWidth: { content: "1600px" },
      fontWeight: { bold: "600", extrabold: "700" },
    },
  },
  plugins: [],
};
