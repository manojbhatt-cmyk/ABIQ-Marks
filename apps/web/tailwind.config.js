/** TransOrg design tokens (UI UX Spec section 1). Navy command rail, light canvas, white cards,
 * one violet accent, fixed semantic colours. Navy, blue, canvas and the light washes are taken from
 * the TransOrg "Alliance Bernstein Marks Process" deck palette. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 700: "#244A66", 800: "#1E4060", 900: "#183850", 950: "#10283A" },
        canvas: { 50: "#FAFBFC", 100: "#F4F6F8", 200: "#E3E8ED" },
        slate: { 300: "#B7C2CC", 400: "#8A99A8", 500: "#506880", 600: "#3D5266", 700: "#2B3B4A", 900: "#16222D" },
        brand: { 50: "#F3F0FF", 100: "#E6E0FF", 500: "#7A5CF0", 600: "#6B4FD8", 700: "#5638B8" },
        info: { 100: "#E6EDF7", 600: "#3860A8", 700: "#2C4D88" },
        success: { 100: "#EEF5E4", 500: "#98C868", 700: "#3F7A1F" },
        warn: { 100: "#FAFAD9", 300: "#E0E058", 700: "#8A6D00" },
        danger: { 100: "#FDECEC", 600: "#D92D20", 700: "#B42318" },
        teal: { 400: "#70C0D8" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,40,58,0.06), 0 1px 3px rgba(16,40,58,0.08)" },
    },
  },
  plugins: [],
};
