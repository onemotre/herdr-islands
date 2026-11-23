import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, theme, window, props } from "herdr";

// macOS-style solid traffic-light window controls using the active Herdr theme palette.
export default class MacWindowControls extends View {
  render() {
    const t = theme(), w = window(), glass = Boolean(props()?.transparent);
    const bar = h_flex().id("window-controls").size_full().px(12).gap(8)
      .items_center().justify_end()
      .when(!glass, (el) => el.bg(t.chrome).border_b(1).border_color(t.border));
    if (!w?.buttons) return bar;
    const dot = (id, label, color, command) => div().id(id).size(12).flex_none().rounded_full()
      .bg(color).cursor_pointer().accessibility_label(label).tooltip(label)
      .hover((s) => s.opacity(0.78))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); run(command); });
    return bar
      .child(dot("mac-minimize", "Minimize window", t.working ?? t.ansi3, "window.minimize"))
      .child(dot("mac-maximize", w.maximized ? "Restore window" : "Maximize window", t.done ?? t.ansi2, "window.maximize"))
      .child(dot("mac-close", "Close window", t.blocked ?? t.ansi1, "window.close"));
  }
}
