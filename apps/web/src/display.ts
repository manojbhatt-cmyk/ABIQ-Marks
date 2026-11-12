/**
 * Presentation rules applied to every piece of text on screen, including text that comes from the API:
 * - process steps show as plain numbers ("Q14" -> "14"); quarters such as "2026-Q3" or "Q3 2026" are left alone;
 * - cycle days show as calendar dates ("day 20" -> "20 Oct"), so no day counter is shown anywhere.
 * Codes stay unchanged in the data, URLs, exports and input values.
 */
let day0: Date | null = null;

export function setDay0(iso?: string | null) {
  day0 = iso ? new Date(`${iso}T00:00:00`) : null;
  if (typeof document !== "undefined") walk(document.body);
}

export function dayDate(n: number | null | undefined): string {
  if (n === null || n === undefined || !day0) return "";
  const d = new Date(day0);
  d.setDate(d.getDate() + Number(n));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const STEP = /(^|[^\w-])Q(\d{1,2})(?!\w)(?!\s+20\d\d)/g;
const DAY_RANGE = /\b[Dd]ays (\d{1,2}) (to|and) (\d{1,2})\b/g;
const DAY = /\b[Dd]ay (\d{1,2})(?: of \d{1,2})?\b/g;

export function displayText(s: string): string {
  if (!s) return s;
  let out = s.replace(STEP, "$1$2");
  if (day0) {
    out = out.replace(DAY_RANGE, (m, a, w, b) => `${dayDate(+a)} ${w} ${dayDate(+b)}`);
    out = out.replace(DAY, (m, n) => dayDate(+n) || m);
  }
  return out;
}

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);

function fixText(node: Node) {
  const p = node.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest("[data-raw]")) return;
  const v = node.nodeValue || "";
  const nv = displayText(v);
  if (nv !== v) node.nodeValue = nv;
}

function walk(node: Node | null) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) return fixText(node);
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (SKIP.has(el.tagName) || el.hasAttribute("data-raw")) return;
  const t = el.getAttribute("title");
  if (t) {
    const nt = displayText(t);
    if (nt !== t) el.setAttribute("title", nt);
  }
  el.childNodes.forEach(walk);
}

export function installDisplayFilter() {
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") fixText(m.target);
      else if (m.type === "attributes") walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["title"] });
  walk(document.body);
}
