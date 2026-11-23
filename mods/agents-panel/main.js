// Sleek Agents card: follows original Herdr agents collection logic (all agents,
// sub-agent trees, pin migration, status timestamps, clean session titles),
// grouped by working directory and styled as a sleek sidebar card.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import {
  agents, terminals, panes, focused, spaces, run, theme, shared,
  setAgentOrder, layout, home,
} from "herdr";
import { box, fit, glass, tint, cardText, SANS, FS, MONO } from "./box.js";

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (l?.terminal ?? l?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function formatDir(dir) {
  if (!dir) return "~";
  const h = home();
  if (dir === h) return "~";
  const clean = dir.replace(/\/+$/, "");
  return clean.split("/").pop() || "/";
}

function fullDir(dir) {
  if (!dir) return "~";
  const h = home();
  return dir === h ? "~" : dir.startsWith(h + "/") ? "~/" + dir.slice(h.length + 1) : dir;
}

export default class SleekAgents extends View {
  init(_props, cx) {
    this.open = localStorage.getItem("folded") !== "1";
    this.folded = new Set();
    this.groupFolded = new Set(JSON.parse(localStorage.getItem("groups.folded") ?? "[]"));
    this.hovered = null;
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
  }

  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  statusMark(t, st, compact = false) {
    if (st === "working") return svg("mods/fa-icons/spinner.svg").size(11).flex_none().text_color(t.working).spin(900);
    if (st === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (st === "blocked") return div().flex_none().px(5).h(16).rounded(4).bg(t.blocked + "26").text_size(10).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (st === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done);
    if (st === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.3).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none();
  }

  subRow(t, s, shown) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 13, t.foreground);
    const on = k.address === shown;
    return h_flex().id(`sub-${k.address}`).pl(28).pr(8).rounded(6).h(24).flex_none().gap(0).items_center()
      .text_size(FS(-0.5)).cursor_pointer()
      .when(on, (el) => el.bg(glass(t.selected)))
      .hover((s) => s.bg(tint(t.foreground, 0.05)))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : run("terminal.peek", { terminal: k.address })))
      .children(s.lines.map((l) => div().self_start().mt(-3).w(9).h(15).mr(4).flex_none()
        .when(Boolean(l), (el) => el.border_l(1.5).border_color(t.input ?? t.border))
        .when(l === "└" || l === "├", (el) => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), (el) => el.child(div().mr(6).child(pic)))
      .child(div().flex_1().truncate().font_family(SANS()).text_color(cardText(t, on ? "primary" : "secondary"))
        .child(k.name || k.template || k.program?.name || k.address))
      .child(this.statusMark(t, st, true));
  }

  render(cx) {
    const t = theme();
    const collapsed = (layout()?.children?.find?.(() => false), false);
    const r = shared("rice") ?? {};
    if (r["sidebar.agents"] === false) {
      fit(layout, run, "agents", 0);
      return div();
    }

    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);

    const nested = new Set(list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));

    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);

    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    const allPanes = panes();
    const paneMap = new Map(allPanes.map((p) => [p.pane, p]));
    const spaceMap = new Map(spaces().map((s) => [s.id, s]));
    const leads = leadPanes(allPanes);
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));

    const dirOf = (a) => paneMap.get(a.pane)?.cwd || spaceMap.get(a.space)?.folder || "";
    const machineOf = (a) => (a.address.includes("/") ? a.address.split("/")[0] : null);

    // Group rest by directory (keeping first-seen order, or pinned first).
    const dirGroups = new Map();
    for (const a of rest) {
      const m = machineOf(a);
      const dir = dirOf(a);
      const gid = `dir:${m ?? ""}\0${dir || a.space}`;
      if (!dirGroups.has(gid)) {
        dirGroups.set(gid, {
          id: gid,
          label: dir ? formatDir(dir) : (a.space_name || "Workspace"),
          tip: dir ? fullDir(dir) : (a.space_name || ""),
          machine: m,
          members: [],
        });
      }
      dirGroups.get(gid).members.push(a);
    }

    const groups = [
      ...(pinned.length ? [{ id: "pinned", label: "Pinned", tip: "Pinned agents", machine: null, members: pinned }] : []),
      ...dirGroups.values(),
    ];

    const orderedList = groups.flatMap((g) => g.members);
    setAgentOrder(orderedList.map((a) => a.address));

    const labels = new Map(list.map((a) => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map((a) => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));

    const row = (a) => {
      const subs = this.tree(all, a.address);
      const pic = icon(a.program, 14, t.foreground);
      const more = detail.get(a.address);
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const name = isPinned
        ? `${a.space_name || label(a)}${more ? ` · ${more}` : ""}`
        : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      const pin = div().id(`pin-${a.address}`).flex_none().p(2).rounded(4).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/fa-icons/${isPinned ? "thumbtack-slash" : "thumbtack"}.svg`).size(11));

      const foldBtn = subs.length > 0 ? div().id(`fold-${a.address}`).h(18).px(3).gap(3).flex().items_center().rounded(4)
        .font_family(MONO).text_size(10.5).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
          cx.notify();
        })
        .child(svg(`mods/fa-icons/chevron-${this.folded.has(a.address) ? "right" : "down"}.svg`).size(9).flex_none())
        .when(this.folded.has(a.address), (el) => el.child(String(subs.length))) : null;

      const mainRow = h_flex().id(`ag-${a.address}`).h(28).px(8).gap(7).flex_none().items_center().rounded(7).cursor_pointer()
        .when(a.focused, (el) => el.bg(glass(t.selected)))
        .when(!a.focused, (el) => el.hover((s) => s.bg(tint(t.foreground, 0.04))))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), (el) => el.child(pic))
        .child(div().flex_1().min_w(0).truncate().font_family(SANS()).text_size(FS(0))
          .text_color(cardText(t, idle ? "secondary" : "primary")).when(a.focused, (el) => el.font_medium()).child(name))
        .when(Boolean(foldBtn), (el) => el.child(foldBtn))
        .when(this.hovered === a.address, (el) => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), (el) => el.child(div().flex_none().font_family(MONO).text_size(FS(-2)).text_color(cardText(t, "dim")).child(duration(now - when))))
        .child(this.statusMark(t, a.status, true));

      if (this.folded.has(a.address) || !subs.length) return [mainRow];
      return [mainRow, ...subs.map((s) => this.subRow(t, s, shown))];
    };

    const groupHeader = (g) => {
      const open = !this.groupFolded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex().id(g.id).h(22).px(8).gap(6).flex_none().items_center().rounded(6).cursor_pointer()
        .text_size(FS(-2)).text_color(cardText(t, "dim")).hover((s) => s.text_color(cardText(t, "primary")))
        .tooltip(g.tip)
        .on_click((_e, cx) => {
          open ? this.groupFolded.add(g.id) : this.groupFolded.delete(g.id);
          localStorage.setItem("groups.folded", JSON.stringify([...this.groupFolded]));
          cx.notify();
        })
        .child(svg("mods/fa-icons/folder.svg").size(11).flex_none())
        .child(div().flex_1().min_w(0).truncate().font_family(SANS()).font_medium().child(g.label))
        .when(Boolean(g.machine), (el) => el.child(div().flex_none().font_family(MONO).text_size(10).text_color(t.dim).child(`@${g.machine}`)))
        .when(!open && top && top !== "idle", (el) => el.child(this.statusMark(t, top, true)))
        .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(t.dim).child(String(g.members.length)))
        .child(svg(`mods/fa-icons/chevron-${open ? "down" : "right"}.svg`).size(9).flex_none());
    };

    const groupCards = groups.map((g) => v_flex().gap(1)
      .child(groupHeader(g))
      .when(!this.groupFolded.has(g.id), (el) => el.children(g.members.flatMap(row))));

    const working = orderedList.filter((a) => a.status === "working").length;
    const blocked = orderedList.filter((a) => a.status === "blocked").length;

    const summary = [
      ...(blocked > 0 ? [div().font_family(MONO).text_size(11).font_bold().text_color(t.blocked).child(`! ${blocked}`)] : []),
      ...(working > 0 ? [h_flex().gap(4).items_center()
        .child(svg("mods/fa-icons/spinner.svg").size(10).text_color(t.working).spin(900))
        .child(div().font_family(MONO).text_size(11).text_color(t.working).child(String(working)))] : []),
      div().font_family(MONO).text_size(11).text_color(t.dim).child(String(orderedList.length)),
    ];

    const body = groupCards.length
      ? v_flex().w_full().max_h(220).overflow_y_scrollbar().gap(8).children(groupCards)
      : div().px(8).py(6).font_family(SANS()).text_size(11.5).text_color(t.dim).child("No agents running");

    // Approximate content height so the card hugs small agent lists and scrolls when large.
    let approx = Math.max(0, groups.length - 1) * 8;
    for (const g of groups) {
      approx += 25;
      if (!this.groupFolded.has(g.id)) {
        for (const a of g.members) {
          approx += 29;
          if (!this.folded.has(a.address)) approx += this.tree(all, a.address).length * 25;
        }
      }
    }
    const targetPx = this.open ? Math.min(254, Math.max(76, 40 + approx)) : 36;
    fit(layout, run, "agents", targetPx);

    return box(t, {
      id: "agents",
      title: "Agents",
      open: this.open,
      onToggle: (_e, cx) => {
        this.open = !this.open;
        localStorage.setItem("folded", this.open ? "0" : "1");
        cx.notify();
      },
      summary,
      extra: summary,
      body,
    });
  }
}
