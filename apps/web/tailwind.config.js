/** Stone & Sage (stone-sage-ui-design.md, decision D25). Every colour is a CSS variable from src/index.css with a
 * light and a dark value, so screens never hold hex values. Older colour names used in the code are mapped onto the
 * system: brand, navy, sky, teal and violet become the graphite ramp; cyan and lime the sage accent; ink, slate,
 * canvas, line and surface the warm neutrals. No blue, no purple, never pure black. */
const v = (name) => `var(--${name})`;
const ramp = (prefix, steps) => Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));
const brand = ramp("brand", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
const accent = ramp("accent", [50, 100, 200, 300, 400, 500, 600, 700]);
const success = { ...ramp("success", [50, 100, 500, 600, 700]), 400: v("success-500") };
const warn = { ...ramp("warning", [50, 100, 500, 600, 700]), 300: v("warning-500") };

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: v("surface"),
        brand, navy: { ...brand, 950: v("brand-900") }, sky: brand, teal: brand, violet: brand,
        accent, cyan: accent, lime: accent,
        ai: ramp("ai", [50, 100, 500, 700]),
        success, leaf: success,
        warn,
        danger: ramp("danger", [50, 100, 500, 600, 700]),
        info: ramp("info", [50, 100, 500, 600, 700]),
        ink: { DEFAULT: v("text"), 600: v("text"), 700: v("text"), 900: v("text") },
        slate: { 300: v("border-strong"), 400: v("text-faint"), 500: v("text-muted"), 600: v("text-muted"), 700: v("text"), 900: v("text") },
        muted: v("text-muted"),
        faint: v("text-faint"),
        line: { DEFAULT: v("border"), 200: v("border") },
        strong: v("border-strong"),
        canvas: { 50: v("surface-2"), 100: v("surface-3"), 200: v("border") },
        surface: { DEFAULT: v("surface"), 0: v("surface"), 50: v("surface-2") },
        raised: v("surface-2"),
        sunken: v("surface-3"),
        page: v("bg"),
        "on-brand": v("on-brand"),
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI Variable Text", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: { card: "none", raised: v("sh-md"), float: v("sh-xl"), toast: v("sh-lg"), hover: v("sh-hover") },
      borderRadius: { card: "12px", control: "8px", tile: "8px", panel: "12px", modal: "12px", chip: "6px" },
      maxWidth: { content: "1320px" },
      fontWeight: { bold: "600", extrabold: "700" },
    },
  },
  plugins: [],
};
