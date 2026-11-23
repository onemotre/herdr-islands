// Sleek experiment: a section is a soft card (the panes' own background, rounded, no border) with a small
// header ("Activity  ⌄") you click to fold; folded, the header shows `summary` instead.
// `fit` sizes the section's layout block; `bar` is a thin continuous progress bar.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared } from "herdr";

// Personal: cards and pills follow the Cards transparency slider (settings-panel).
const glass = (c) => {
  const r = shared("rice") ?? {};
  const p = r["transparency.on"] === false ? 100 : (r["transparency.cards"] ?? 100);
  return p >= 100 || !/^#[0-9a-f]{6}$/i.test(c) ? c : c + Math.round((p / 100) * 255).toString(16).padStart(2, "0");
};

export const SANS = () => (shared("rice") ?? {})["sidebar.font"] || "Geist";
export const FS = (delta = 0) => Math.max(9, ((shared("rice") ?? {})["sidebar.fontSize"] ?? 12.5) + delta);
export { glass };
export const tint = (c, a) => /^#[0-9a-f]{6}$/i.test(c) ? c + Math.round(a * 255).toString(16).padStart(2, "0") : c;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function cardBg(t) {
  const c = (shared("rice") ?? {})["sidebar.cardColor"];
  if (!c) return t.background;
  if (c === "chrome") return t.chrome ?? t.background;
  if (c === "raised") return t.raised ?? t.selected ?? t.background;
  if (c === "selected") return t.selected ?? t.background;
  if (c === "accent") {
    const a = t.background ?? "", b = t.accent ?? "";
    if (/^#[0-9a-f]{6}/i.test(a) && /^#[0-9a-f]{6}/i.test(b)) {
      return "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * 0.86 + parseInt(b.slice(i, i + 2), 16) * 0.14).toString(16).padStart(2, "0")).join("");
    }
    return t.selected ?? t.background;
  }
  return c;
}

export function cardText(t, role = "primary") {
  const v = (shared("rice") ?? {})["sidebar.textColor"];
  if (!v) return role === "primary" ? t.foreground : role === "secondary" ? t.muted : t.dim;
  const c = t[v] ?? v;
  return role === "primary" ? c : role === "secondary" ? tint(c, 0.78) : tint(c, 0.56);
}

export function box(t, { id, title, open, onToggle, summary = [], extra = [], body }) {
  const bits = open ? extra : summary;
  return v_flex().w_full().flex_none().rounded(10).bg(glass(cardBg(t))).p(4)
    // Hovering the header brightens its title and chevron (no nested highlight).
    .child(h_flex().id(`${id}-head`).h(28).px(8).gap(8).items_center().rounded(7).cursor_pointer()
      .text_color(cardText(t, "secondary")).hover((h) => h.text_color(cardText(t, "primary"))).on_click(onToggle)
      .child(div().flex_none().font_family(SANS()).text_size(FS(-0.5)).font_semibold().child(cap(title)))
      .child(div().flex_1())
      .when(bits.length > 0, (el) => el.child(h_flex().flex_shrink_1().min_w(0).gap(8).items_center().children(bits)))
      .child(svg(`mods/fa-icons/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none()))
    .when(open, (el) => el.child(v_flex().pt(2).child(body)));
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export function fit(layout, run, id, px) {
  const node = find(layout(), id);
  if (!node) return;
  if (!px) { if (!node.hidden) run("layout.hide", { id }); return; }
  if (node.hidden) run("layout.show", { id });
  if (node.size?.px !== px) run("layout.resize", { id, px });
}

export const pctColor = (t, pct) => pct >= 85 ? t.blocked : pct >= 60 ? t.working : t.ansi4;

// A thin rounded progress bar filled to `pct`.
export function bar(t, pct, color) {
  const p = Math.max(0, Math.min(100, pct));
  return div().flex_1().min_w(0).h(4).rounded(2).bg(t.border)
    .child(div().h_full().rounded(2).bg(color).w(p > 0 ? `${Math.max(2, p)}%` : 0));
}
