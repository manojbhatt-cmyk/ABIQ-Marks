/** TransOrg palette, taken from TransOrg's "Alliance Bernstein Marks Process" deck:
 * navy #183850, TransOrg blue #3860A8, sky #1E9BD7, teal #70C0D8, green #98C868, olive #5D7016,
 * lime #E0E058, slate #506880, washes #E6EDF7 / #EEF5E4 / #FAFAD9 / #E9F5F9. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 600: "#2A5578", 700: "#224868", 800: "#1C405C", 900: "#183850", 950: "#0F2638" },
        canvas: { 50: "#F8FAFC", 100: "#F1F5FA", 200: "#DDE3E9" },
        slate: { 300: "#C0C8D0", 400: "#8898A8", 500: "#506880", 600: "#3D5266", 700: "#2B3B4A", 900: "#16222D" },
        brand: { 50: "#EDF2FB", 100: "#D5E1F5", 200: "#AFC4EA", 500: "#4A74BE", 600: "#3860A8", 700: "#2C4D88", 800: "#223C6B" },
        sky: { 50: "#E8F5FC", 100: "#CDE9F2", 500: "#1E9BD7", 600: "#1784BA", 700: "#126A96" },
        teal: { 50: "#E9F5F9", 100: "#CDE9F2", 400: "#70C0D8", 600: "#3E9AB6", 700: "#2B7790" },
        leaf: { 50: "#EEF5E4", 100: "#DDEBC8", 400: "#98C868", 600: "#6E9E3F", 700: "#5D7016" },
        lime: { 50: "#FAFAD9", 100: "#F3F3B0", 400: "#E0E058", 700: "#8A8A12" },
        info: { 100: "#E6EDF7", 600: "#3860A8", 700: "#2C4D88" },
        success: { 100: "#EEF5E4", 500: "#98C868", 700: "#4F7A22" },
        warn: { 100: "#FFF4D6", 300: "#FFC94A", 700: "#9A6500" },
        danger: { 100: "#FDECEC", 600: "#D92D20", 700: "#B42318" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(24,56,80,0.06), 0 4px 14px rgba(24,56,80,0.06)" },
      backgroundImage: {
        rail: "linear-gradient(180deg, #183850 0%, #1C405C 55%, #224868 100%)",
        hero: "linear-gradient(110deg, #183850 0%, #3860A8 55%, #1E9BD7 100%)",
      },
    },
  },
  plugins: [],
};
