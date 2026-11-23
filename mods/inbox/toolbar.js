import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, layout, shared, setShared, props, settings } from "herdr";
import { withKey } from "./ui.js";

export const COUNT = "inbox.inbox.count";
// The count when the Inbox was last open: a higher one pulses the badge.
const SEEN_COUNT = "inbox.inbox.seen";

const find = (node, id) => {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return null;
};

export function showPanel(child) {
  run("layout.select", { stack: "panel-body", child });
  run("layout.show", { id: "panel" });
}

export class InboxButton {
  fitWidth(size) {
    if (!props()?.autoWidth) return;
    const slot = find(layout(), "inbox-button");
    // Layout dimensions are authored at zoom 1; measure the non-shrinking
    // button itself, not its enclosing slot. Keep a small inter-button gutter.
    const zoom = settings().zoom || 1;
    const width = Math.ceil(size.width / zoom) + 4;
    if (!slot || !Number.isFinite(width) || width <= 4) return;
    if (typeof slot.size?.px !== "number" || Math.abs(slot.size.px - width) >= 1) {
      run("layout.resize", { id: "inbox-button", px: width });
    }
  }

  render() {
    const t = theme();
    const panel = find(layout(), "panel"), body = find(layout(), "panel-body");
    const on = panel && !panel.hidden && body?.active === "inbox";
    const n = shared(COUNT) ?? 0, stored = shared(SEEN_COUNT), seen = stored ?? n;
    if (stored == null || (on ? seen !== n : n < seen)) setShared(SEEN_COUNT, n);
    const fresh = !on && n > seen;
    const glass = Boolean(props()?.transparent);
    return h_flex().id("inbox-button").size_full().items_center()
      // Keep the default start alignment in composed toolbars; center only
      // standalone buttons, without layering conflicting alignment styles.
      .when(props()?.align !== "start", (el) => el.justify_center())
      .when(!glass, (el) => el.bg(t.chrome).border_b(1).border_color(t.border))
      .child(h_flex().id("inbox-toggle").h(26).px(8).gap(5).flex_none().items_center().rounded(6).cursor_pointer().text_size(12)
        .on_size_change((size) => this.fitWidth(size))
        .text_color(on ? t.foreground : t.muted).when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .tooltip(withKey(on ? "Hide the Inbox" : "Show the Inbox", "inbox.panel-inbox"))
        .on_click(() => (on ? run("layout.hide", { id: "panel" }) : showPanel("inbox")))
        .when(Boolean(props()?.icon), (el) => el.child(svg("mods/inbox/inbox.svg").size(14).flex_none()))
        .child("Inbox")
        .when(n > 0, (el) => el.child(
          div().px(5).rounded(8).bg(t.blocked).text_color(t.background).text_size(10).font_semibold()
            .when(fresh, (b) => b.loop("opacity", { from: 0.45, to: 1, period: 1400 }))
            .child(String(n)))));
  }
}

// Mirrors the left sidebar's toggle at the window's other edge.
export class PanelToggle {
  render() {
    const t = theme(), panel = find(layout(), "panel"), on = Boolean(panel && !panel.hidden), glass = Boolean(props()?.transparent);
    return h_flex().id("panel-toggle-bar").size_full().items_center().justify_center()
      .when(!glass, (el) => el.bg(t.chrome).border_b(1).border_color(t.border))
      .child(div().id("panel-toggle").size(26).flex().items_center().justify_center().rounded(6).cursor_pointer()
        .text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(withKey(on ? "Hide panel" : "Show panel", "layout.toggle:panel"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("layout.toggle", { id: "panel" }))
        .child(svg("mods/inbox/panel.svg").size(15)));
  }
}
