import { View, div, svg } from "gpui-kit";
import { Editor, EditorState, h_flex, v_flex, TextView, Scrollbar, v_virtual_list, Input, InputState } from "gpui-base";
import {
  checking, closeOverlay, exec, focused, home, layout, notify, openOverlay, panes, pickFolder,
  props, readTextFile, run, writeTextFile, setShared, settings, shared, spaces, theme,
} from "herdr";
import { basename, directory, displayPath, FILE_LIMIT, FOLDER_LIMIT, gitRoot, join, key, projectDirectory, scan } from "./catalog.js";
import { markdownTarget, resolveMarkdownTarget } from "./links.js";

const MOD = "markdown-docs";
const TITLE = "Markdown";
const SOURCES = `${MOD}.sources`;
const SELECTIONS = `${MOD}.selection`;
const RESCAN = `${MOD}.rescan`;
const ROW = 27;
// Status bar order.
const MODES = [
  ["preview", "Preview", "Rendered Markdown"],
  ["source", "Source", "Markdown source (editable for local files, Ctrl+S saves)"],
];
const find = (node, id) => node?.id === id ? node : (node?.children ?? []).map(n => find(n, id)).find(Boolean);
const isShowing = () => {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  return !panel || (!panel.hidden && body?.active === MOD);
};
const chosen = tab => shared(SELECTIONS)?.[tab];
const report = body => notify({ title: TITLE, body, level: "warning" });
const copy = (text, what, cx) => {
  try { cx.write_to_clipboard(text); notify({ title: TITLE, body: `Copied ${what}`, timeout: 1500 }); }
  catch { report("Cannot write to the clipboard."); }
};
const documentId = doc => doc?.file ? key(doc.on ?? null, doc.file) : null;

function rememberDocument(tab, doc) {
  const set = { ...shared(SELECTIONS) };
  delete set[tab];
  const recent = Object.fromEntries(Object.entries(set).slice(-95));
  setShared(SELECTIONS, { ...recent, [tab]: doc });
}

function sources() {
  const saved = shared(SOURCES);
  return { project: saved?.project !== false, folders: Array.isArray(saved?.folders) ? saved.folders.map(directory).filter(Boolean) : [] };
}

function workspace() {
  const focus = focused(), space = spaces().find(s => s.active), tab = space?.tabs.find(t => t.active);
  const list = tab ? panes().filter(p => p.tab === tab.id) : [];
  return { focus, space, tab, list };
}

async function linkRoots(doc, tabId) {
  const cfg = sources(), on = doc.on ?? null;
  const roots = on === null ? [...cfg.folders] : [];
  if (cfg.project) {
    const project = doc.project;
    if (project?.root && project.on === on) roots.push(project.root);
    else {
      // Panes created before navigation was added do not have a saved project.
      const { space, tab, list } = workspace();
      if (space && tab?.id === tabId && (space.machine ?? null) === on) {
        const cwd = projectDirectory(list.find(p => p.terminal && p.cwd)?.cwd ?? space.folder, on);
        if (cwd) roots.push(await gitRoot(cwd, on));
      }
    }
  }
  return [...new Set(roots)];
}

function button(id, label, action, t, tip = label) {
  return h_flex().id(id).h(25).px(8).flex_none().items_center().rounded(5).text_size(12)
    .text_color(t.muted).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
    .tooltip(tip).on_click(action).child(label);
}

function status(text, t) {
  return div().p(12).text_size(12).text_color(t.muted).child(text);
}

class Browser {
  init(cx) {
    this.collapsed = new Set();
    this.records = new Map();
    this.lastTerminal = new Map();
    this.height = 0;
    this.roots = [];
    this.visible = false;
    if (!checking()) cx.timer.every(8000, cx => { if (isShowing()) this.scanRoots(cx, true); });
  }

  scanRoots(cx, force = false) {
    const cfg = sources(), { focus, space, tab, list } = workspace();
    let active = list.find(p => p.pane === focus?.pane && p.terminal);
    if (active && tab) {
      if (this.lastTerminal.size >= 128) this.lastTerminal.clear();
      this.lastTerminal.set(tab.id, active.pane);
    }
    active ??= list.find(p => p.pane === this.lastTerminal.get(tab?.id)) ?? list.find(p => p.terminal);
    const on = space?.machine ?? null;
    const cwd = cfg.project ? projectDirectory(active?.cwd ?? focus?.cwd ?? space?.folder, on) : null;
    const projectKey = cwd ? key(on, cwd) : null;
    if (this.projectKey !== projectKey) {
      this.projectKey = projectKey;
      this.project = null;
      if (cwd) cx.spawn(async cx => {
        const root = await gitRoot(cwd, on);
        if (this.projectKey !== projectKey) return;
        this.project = { root, on, project: true };
        cx.notify();
      });
    }

    this.roots = cfg.folders.map(root => ({ root, on: null, project: false }));
    if (this.project && !this.roots.some(s => key(s.on, s.root) === key(this.project.on, this.project.root))) this.roots.push(this.project);
    const live = new Set(this.roots.map(s => key(s.on, s.root)));
    for (const id of this.records.keys()) if (!live.has(id)) this.records.delete(id);
    for (const source of this.roots) {
      const id = key(source.on, source.root);
      let record = this.records.get(id);
      if (record?.project !== source.project) {
        record = { project: source.project };
        this.records.set(id, record);
      }
      if (record.loading || (record.scanned && !force)) continue;
      record.loading = true;
      cx.spawn(async cx => {
        try {
          record.data = await scan(source);
          record.error = null;
        } catch (error) { record.error = String(error); }
        finally {
          record.loading = false;
          record.scanned = true;
          cx.notify();
        }
      });
    }
  }

  open(file, on, cx) {
    const { focus, tab, list } = workspace();
    if (!tab || !list.length) return report("Open a workspace tab first.");
    const viewer = list.find(p => p.mod === MOD);
    const anchor = list.find(p => p.pane === focus?.pane && p.terminal) ?? list.find(p => p.terminal) ?? list[0];
    const selection = { file, on, project: this.project ?? null };
    rememberDocument(tab.id, selection);
    if (tab.zoomed) {
      const zoomed = list.find(p => p.zoomed);
      if (zoomed && viewer?.pane !== zoomed.pane) run("pane.zoom", { pane: zoomed.pane });
    }
    if (viewer) run("pane.focus", { pane: viewer.pane });
    else run("pane.split", { pane: anchor.pane, direction: "right", mod: MOD, props: { role: "preview", tab: tab.id, initial: selection } });
    cx.notify();
  }

  rows() {
    const rows = [];
    for (const source of this.roots) {
      const { root, on, project } = source, id = key(on, root), record = this.records.get(id);
      const title = project ? `Project · ${basename(root)}` : displayPath(root, on);
      const add = (nodes, depth) => {
        for (const node of nodes) {
          const file = join(root, node.rel), id = JSON.stringify([on, root, node.rel]);
          const open = node.dir && this.collapsed.has(id);
          rows.push({ id, depth, label: node.name, dir: node.dir, open, file, on });
          if (open) add(node.children, depth + 1);
        }
      };
      const open = !this.collapsed.has(id);
      rows.push({ id, depth: 0, label: title, detail: record?.data?.count?.toString(), dir: true, open, root: true });
      if (!open) continue;
      if (record?.error) rows.push({ id: `${id}:error`, depth: 1, label: record.error, note: true });
      if (record?.data) {
        add(record.data.nodes, 1);
        if (!record.data.count) rows.push({ id: `${id}:empty`, depth: 1, label: "No Markdown files", note: true });
        if (record.data.limited) rows.push({ id: `${id}:limit`, depth: 1, label: `Showing the first ${FILE_LIMIT} documents`, note: true });
      } else if (record?.loading) rows.push({ id: `${id}:loading`, depth: 1, label: "Scanning…", note: true });
    }
    return rows;
  }

  render(cx) {
    const t = theme();
    if (!checking()) {
      const shown = isShowing();
      const stamp = shared(RESCAN);
      if (shown) this.scanRoots(cx, !this.visible || stamp !== this.stamp);
      this.stamp = stamp;
      this.visible = shown;
    }
    const rows = this.rows(), selected = chosen(focused()?.tab);
    const byId = new Map(rows.map(row => [row.id, row]));
    const draw = row => {
      const active = Boolean(row.file && !row.dir && selected?.file === row.file && selected.on === row.on);
      return h_flex().h(ROW).px(6).pl(6 + 13 * Math.min(row.depth, 12)).gap(6).items_center().rounded(5)
        .bg(active ? t.selected : row.root ? t.raised : t.background)
        .text_color(row.note ? t.muted : t.foreground).text_size(row.note ? 11 : 12)
        .when(!row.note, el => el.cursor_pointer()
          .child(div().w(12).flex_none().text_color(t.muted).child(row.dir ? (row.open ? "▾" : "▸") : ""))
          .child(svg(`mods/${MOD}/${row.dir ? "folder" : "document"}.svg`).size(14).flex_none().text_color(row.dir ? t.accent : t.muted)))
        .child(div().flex_1().min_w(0).truncate().when(row.root, el => el.font_semibold()).child(row.label))
        .when(row.detail != null, el => el.child(div().text_size(10).text_color(t.muted).child(row.detail)));
    };
    return v_flex().id(MOD).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground)
      .child(h_flex().h(42).px(10).gap(4).items_center().border_b(1).border_color(t.border).flex_none()
        .child(div().flex_1().font_semibold().text_size(13).child(TITLE))
        .child(button("docs-sources", "Sources", () => openOverlay({ mod: MOD, kind: "dialog", width: 430, height: 370, props: { role: "sources" } }), t, "Add or remove Markdown folders"))
        .child(button("docs-rescan", "↻", (_e, cx) => { this.scanRoots(cx, true); cx.notify(); }, t, "Rescan folders")))
      .child(div().id("docs-tree-size").flex_1().min_h(0).relative().overflow_hidden()
        .on_size_change((size, cx) => { if (size.height !== this.height) { this.height = size.height; cx.notify(); } })
        .when(!rows.length, el => el.child(status(this.projectKey && !this.project ? "Finding the project…" : "No document sources. Use Sources to add a folder.", t)))
        .when(rows.length > 0 && this.height > 0, el => el.child(div().h(this.height).px(4).relative()
          .child(v_virtual_list("docs-tree", rows.length, ROW, i => rows[i].id,
            ({ start, end }) => rows.slice(start, end).map(draw))
            .on_item_secondary_click((id, _e, _cx) => {
              const row = byId.get(id);
              if (!row?.file) return;
              openOverlay({ mod: MOD, kind: "popup", width: 190, height: row.dir ? 92 : 150,
                props: { role: "file-menu", file: row.file, on: row.on, dir: row.dir } });
            })
            .on_item_click((id, cx) => {
              const row = byId.get(id);
              if (!row || row.note) return;
              if (!row.dir) return this.open(row.file, row.on, cx);
              if (this.collapsed.has(id)) this.collapsed.delete(id);
              else this.collapsed.add(id);
              cx.notify();
            }))
          .child(Scrollbar.vertical("docs-tree").absolute().inset_0()))));
  }
}

class Preview {
  constructor(p, cx) {
    this.p = p;
    this.id = null;
    this.text = null;
    this.mode = MODES.some(m => m[0] === p.mode) ? p.mode : "preview";
    this.source = null;
    this.history = [];
    this.localDocument = p.initial;
  }

  get document() { return (this.p.tab && chosen(this.p.tab)) || this.localDocument; }

  // Writing goes through writeTextFile, which only reaches this computer.
  editable() { return Boolean(this.document?.file) && (this.document.on ?? null) === null; }

  releaseSource() {
    this.source?.release();
    this.source = null;
    this.dirty = false;
  }

  save(cx) {
    const doc = this.document;
    if (!this.source || !this.dirty || this.saving || !this.editable()) return;
    const id = this.id, value = this.source.value(), expected = this.text;
    this.saving = true; cx.notify();
    cx.spawn(async cx => {
      try {
        await writeTextFile(doc.file, value, expected);
        if (this.id === id) { this.text = value; this.dirty = this.source?.value() !== value; }
        notify({ title: TITLE, body: `Saved ${basename(doc.file)}`, timeout: 1500 });
      } catch (error) {
        report(`Cannot save: ${error?.message ?? error}. Reload the file (↻) and redo the change if it was edited elsewhere.`);
      } finally { this.saving = false; cx.notify(); }
    });
  }

  syncSource(text) {
    if (text === null) this.releaseSource();
    else if (this.source) {
      if (this.source.value() !== text) this.source.set_value(text);
    } else if (this.mode === "source") {
      this.source = EditorState.new({
        language: "markdown", value: text, readonly: !this.editable(), line_numbers: true,
        soft_wrap: true, folding: false, font_family: settings().font_family,
      });
      this.source.on("change", (_e, cx) => {
        const dirty = this.source && this.source.value() !== this.text;
        if (dirty !== this.dirty) { this.dirty = dirty; cx.notify(); }
      });
    }
  }

  switchMode(mode, cx) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === "source" && !this.error) this.syncSource(this.text);
    cx.notify();
  }

  close() {
    this.request = null;
    this.navigation = null;
    this.releaseSource();
  }

  follow(url, doc, cx) {
    if (documentId(doc) !== documentId(this.document)) return;
    let target;
    try { target = markdownTarget(url, doc.file); }
    catch (error) { return report(error.message); }
    if (target) this.navigate(doc, target, cx);
  }

  back(cx) {
    if (this.history.length) this.navigate(this.document, null, cx);
  }

  navigate(from, target, cx) {
    const request = {}, origin = documentId(from);
    const active = () => this.navigation === request && documentId(this.document) === origin;
    this.navigation = request;
    cx.spawn(async cx => {
      try {
        const on = from.on ?? null;
        const next = target
          ? { ...from, file: await resolveMarkdownTarget(target, await linkRoots(from, this.p.tab), on) }
          : this.history.at(-1);
        if (!active() || !next || documentId(next) === origin) return;
        const text = await readTextFile(next.file, { on: next.on });
        if (!active()) return;
        if (text === null) throw new Error("Linked Markdown file no longer exists or cannot be read.");
        if (target) this.history = [...this.history.slice(-31), from];
        else this.history.pop();
        this.request = null;
        this.id = documentId(next);
        this.text = text;
        this.error = null;
        this.releaseSource();
        this.syncSource(text);
        this.localDocument = next;
        if (this.p.tab) rememberDocument(this.p.tab, next);
        cx.notify();
      } catch (error) {
        if (active()) report(error.message ?? String(error));
      } finally {
        if (this.navigation === request) this.navigation = null;
      }
    });
  }

  load(doc, cx, force = false) {
    if (checking() || !doc?.file) return;
    const id = documentId(doc);
    if (!force && this.id === id) return;
    if (this.id !== id) {
      if (this.dirty) report("Unsaved changes in the previous document were discarded.");
      this.history = [];
      this.navigation = null;
      this.text = null;
      this.releaseSource();
    }
    this.id = id;
    this.error = null;
    const request = {};
    this.request = request;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(doc.file, { on: doc.on });
        if (this.request !== request) return;
        this.text = text;
        this.syncSource(text);
        if (text === null) this.error = "This file no longer exists or cannot be read.";
      } catch (error) {
        if (this.request !== request) return;
        this.error = `Cannot read document: ${error}`;
      }
      cx.notify();
    });
  }

  render(cx) {
    const doc = this.document, t = theme();
    this.load(doc, cx);
    const showSource = this.mode === "source";
    const message = this.error || (!doc?.file ? `Choose a Markdown file from ${TITLE}.`
      : this.text === null ? "Loading document…" : !showSource && this.text === "" ? "Empty document." : null);
    const segment = ([mode, label, tip]) => {
      const on = this.mode === mode;
      return h_flex().id(`docs-mode-${mode}`).h(24).px(10).items_center().rounded(5).text_size(12).cursor_pointer()
        .bg(on ? t.background : t.raised).text_color(on ? t.foreground : t.muted).when(on, el => el.font_semibold().shadow_sm())
        .hover(s => s.text_color(t.foreground)).tooltip(tip).on_click((_e, cx) => this.switchMode(mode, cx)).child(label);
    };
    return v_flex().id("docs-preview").size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground)
      .child(h_flex().h(46).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border).bg(t.surface)
        .when(this.history.length > 0, el => el.child(button("docs-back", "←", (_e, cx) => this.back(cx), t, "Back to the previous document")))
        .child(svg(`mods/${MOD}/document.svg`).size(16).flex_none().text_color(t.accent))
        .child(v_flex().flex_1().min_w(0)
          .child(div().id("docs-name").truncate().text_size(13).font_semibold()
            .when(Boolean(doc?.file), el => el.cursor_pointer().hover(s => s.text_color(t.accent)).tooltip("Click to copy the file name")
              .on_click((_e, cx) => copy(basename(doc.file), "file name", cx)))
            .child(doc?.file ? basename(doc.file) : TITLE))
          .when(Boolean(doc?.file), el => el.child(div().id("docs-path").truncate().text_size(10).text_color(t.muted)
            .cursor_pointer().hover(s => s.text_color(t.accent)).tooltip("Click to copy the full path")
            .on_click((_e, cx) => copy(doc.file, "path", cx)).child(displayPath(doc.file, doc.on)))))
        .when(Boolean(doc?.file), el => el.child(h_flex().flex_none().gap(2).p(2).rounded(7).bg(t.raised)
          .children(MODES.map(segment))))
        .when(this.mode === "source" && this.editable(), el => el.child(button("docs-save", this.saving ? "Saving…" : this.dirty ? "Save ●" : "Saved",
          (_e, cx) => this.save(cx), t, "Save (Ctrl+S)").bg(this.dirty ? t.selected : t.raised)))
        .child(button("docs-preview-refresh", "↻", (_e, cx) => {
          if (this.dirty) return report("Save or undo your edits before reloading.");
          this.load(doc, cx, true); cx.notify();
        }, t, "Reload document")))
      .when(Boolean(message), el => el.child(status(message, t)))
      .when(!message && this.mode === "preview", el => el.child(div().flex_1().min_h(0).overflow_hidden().px(18).py(10)
        .child(TextView.markdown(`docs-render:${this.id}`, this.text).size_full().scrollable(true).selectable(true)
          .on_link_click((url, cx) => this.follow(url, doc, cx)))))
      .when(!message && showSource && Boolean(this.source), el => el.child(div().id("docs-source-editor").flex_1().min_h(0).flex().flex_col()
        .on_key_down((e, cx) => {
          if (e.key === "s" && (e.modifiers.control || e.modifiers.platform)) { cx.stop_propagation(); this.save(cx); }
        })
        .child(Editor.new(this.source).flex_1().min_h(0))));
  }
}

function menuItem(id, label, act, t, danger = false) {
  return h_flex().id(id).h(28).px(10).items_center().rounded(5).text_size(12).cursor_pointer()
    .text_color(danger ? t.ansi1 : t.foreground).hover(s => s.bg(t.hover)).on_click(act).child(label);
}

class FileMenu {
  constructor(p) { this.p = p; }
  render() {
    const t = theme(), { file, on, dir, overlay } = this.p;
    const done = (text, what) => (_e, cx) => { closeOverlay(overlay); copy(text, what, cx); };
    const open = role => () => {
      closeOverlay(overlay);
      openOverlay({ mod: MOD, kind: "dialog", width: 400, height: role === "file-rename" ? 150 : 140, props: { role, file, on } });
    };
    return v_flex().id("docs-file-menu").size_full().p(4).gap(1).bg(t.popover).text_color(t.foreground)
      .child(menuItem("docs-copy-path", "Copy PATH", done(file, "path"), t))
      .child(menuItem("docs-copy-name", "Copy Name", done(basename(file), "file name"), t))
      .when(!dir, el => el.child(menuItem("docs-rename", "Rename", open("file-rename"), t))
        .child(menuItem("docs-delete", "Delete", open("file-delete"), t, true)));
  }
}

const parentOf = file => file.slice(0, file.lastIndexOf("/")) || "/";

function retarget(from, to) {
  const set = { ...shared(SELECTIONS) };
  for (const [tab, doc] of Object.entries(set)) if (doc?.file === from.file && (doc.on ?? null) === from.on) set[tab] = { ...doc, file: to };
  setShared(SELECTIONS, set);
}

class FileRename {
  constructor(p, cx) {
    this.p = p;
    this.input = InputState.new({ value: basename(p.file), placeholder: "File name" });
    this.input.on("submit", (_e, cx) => this.submit(cx));
    cx.timer.after(1, () => this.input.focus());
  }
  close() { this.input.release(); }
  submit(cx) {
    if (this.busy) return;
    const name = this.input.value().trim(), { file, on, overlay } = this.p;
    if (!name || /[\/\x00-\x1f]/.test(name) || name === "." || name === "..") { this.error = "Invalid file name."; return cx.notify(); }
    if (!/\.(md|markdown)$/i.test(name)) { this.error = "Keep a .md or .markdown extension."; return cx.notify(); }
    if (name === basename(file)) return closeOverlay(overlay);
    const next = join(parentOf(file), name);
    this.busy = true; this.error = null; cx.notify();
    cx.spawn(async cx => {
      try {
        const r = await exec("sh", ["-c", '[ -e "$2" ] && exit 9; mv -- "$1" "$2"', "plans-rename", file, next], { on, timeout: 8000 });
        if (r.code === 9) this.error = "A file with that name already exists.";
        else if (r.code !== 0) this.error = r.stderr.trim().split("\n")[0] || `mv exited with ${r.code}`;
        else {
          retarget({ file, on: on ?? null }, next);
          setShared(RESCAN, Date.now());
          return closeOverlay(overlay);
        }
      } catch (e) { this.error = String(e); }
      finally { this.busy = false; cx.notify(); }
    });
  }
  render() {
    const t = theme();
    return v_flex().id("docs-rename").size_full().p(14).gap(8).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(div().font_semibold().text_size(15).child("Rename"))
      .child(Input.new(this.input))
      .child(div().h(16).text_size(11).text_color(t.ansi1).child(this.error ?? ""))
      .child(h_flex().gap(6).justify_end()
        .child(button("docs-rename-cancel", "Cancel", () => closeOverlay(this.p.overlay), t))
        .child(button("docs-rename-ok", this.busy ? "Renaming…" : "Rename", (_e, cx) => this.submit(cx), t).bg(t.selected)));
  }
}

class FileDelete {
  constructor(p) { this.p = p; }
  go(cx) {
    if (this.busy) return;
    const { file, on, overlay } = this.p;
    this.busy = true; cx.notify();
    cx.spawn(async cx => {
      try {
        const r = await exec("rm", ["-f", "--", file], { on, timeout: 8000 });
        if (r.code !== 0) this.error = r.stderr.trim().split("\n")[0] || `rm exited with ${r.code}`;
        else { setShared(RESCAN, Date.now()); return closeOverlay(overlay); }
      } catch (e) { this.error = String(e); }
      finally { this.busy = false; cx.notify(); }
    });
  }
  render() {
    const t = theme(), { file, on } = this.p;
    return v_flex().id("docs-delete").size_full().p(14).gap(8).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(div().font_semibold().text_size(15).child(`Delete ${basename(file)}?`))
      .child(div().flex_1().min_h(0).text_size(11).text_color(t.muted).child(`${displayPath(file, on)}\nThis cannot be undone.`))
      .child(div().h(16).text_size(11).text_color(t.ansi1).child(this.error ?? ""))
      .child(h_flex().gap(6).justify_end()
        .child(button("docs-delete-cancel", "Cancel", () => closeOverlay(this.p.overlay), t))
        .child(button("docs-delete-ok", this.busy ? "Deleting…" : "Delete", (_e, cx) => this.go(cx), t).bg(t.ansi1).text_color(t.background)));
  }
}

class SourceDialog {
  constructor(p) { this.overlay = p.overlay; }

  add(cx) {
    if (this.picking || sources().folders.length >= FOLDER_LIMIT) return;
    this.picking = true;
    cx.spawn(async cx => {
      try {
        const path = directory(await pickFolder({ prompt: "Add Markdown Folder" }));
        if (!path) return;
        const cfg = sources();
        if (!cfg.folders.includes(path) && cfg.folders.length < FOLDER_LIMIT) {
          setShared(SOURCES, { ...cfg, folders: [...cfg.folders, path] });
        }
      } catch (error) { report(`Could not pick a folder: ${error}`); }
      finally { this.picking = false; cx.notify(); }
    });
  }

  render() {
    const t = theme(), cfg = sources();
    return v_flex().id("docs-source-dialog").size_full().p(14).gap(8).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(h_flex().gap(6).items_center().flex_none()
        .child(div().flex_1().font_semibold().text_size(15).child(`${TITLE} sources`))
        .child(button("docs-source-done", "Done", () => closeOverlay(this.overlay), t)))
      .child(h_flex().h(32).px(7).gap(4).flex_none().items_center().bg(t.raised).rounded(5)
        .child(div().flex_1().child("Follow the current project"))
        .child(button("docs-project-toggle", cfg.project ? "On" : "Off", () => setShared(SOURCES, { ...cfg, project: !cfg.project }), t)))
      .child(v_flex().id("docs-source-list").flex_1().min_h(0).gap(3).overflow_y_scrollbar()
        .when(!cfg.folders.length, el => el.child(status("No fixed folders.", t)))
        .children(cfg.folders.map(path => h_flex().h(30).px(7).gap(6).flex_none().items_center().rounded(5).bg(t.raised)
          .child(svg(`mods/${MOD}/folder.svg`).size(14).flex_none().text_color(t.accent))
          .child(div().flex_1().min_w(0).truncate().child(displayPath(path)))
          .child(button(`docs-remove-${path}`, "×", () => setShared(SOURCES, { ...cfg, folders: cfg.folders.filter(folder => folder !== path) }), t, "Remove source (does not delete files)")))))
      .child(h_flex().items_center().flex_none().gap(6)
        .child(div().flex_1().text_size(11).text_color(t.muted).child(`${cfg.folders.length} / ${FOLDER_LIMIT} fixed folders`))
        .when(cfg.folders.length < FOLDER_LIMIT, el => el.child(button("docs-add-folder", this.picking ? "Choosing…" : "+ Add folder", (_e, cx) => this.add(cx), t))));
  }
}

export default class MarkdownDocs extends View {
  init(_p, cx) {
    const p = props() ?? {};
    if (p.role === "toolbar") {
      this.toolbar = true;
      if (!checking()) {
        const enabled = shared("workspace.panels") ?? ["files", "changes"];
        if (!enabled.includes(MOD)) setShared("workspace.panels", [...enabled, MOD]);
      }
    } else if (p.role === "preview") {
      this.part = new Preview(p, cx);
      this.part.load(this.part.document, cx);
    } else if (p.role === "sources") this.part = new SourceDialog(p);
    else if (p.role === "file-menu") this.part = new FileMenu(p);
    else if (p.role === "file-rename") this.part = new FileRename(p, cx);
    else if (p.role === "file-delete") this.part = new FileDelete(p);
    else { this.part = new Browser(); this.part.init(cx); }
  }

  close() { this.part?.close?.(); }

  render(cx) {
    if (!this.toolbar) return this.part.render(cx);
    const t = theme(), on = isShowing(), glass = Boolean(props()?.transparent);
    return h_flex().size_full().when(!glass, el => el.pr(8).justify_end().bg(t.chrome).border_b(1).border_color(t.border)).when(glass, el => el.justify_center()).items_center()
      .child(h_flex().id("docs-toolbar").h(26).px(8).gap(5).flex_none().items_center().rounded(6).cursor_pointer()
        .text_size(12).when(on, el => el.bg(t.selected)).when(!on && !glass, el => el.bg(t.chrome)).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).tooltip(on ? `Hide ${TITLE}` : `Show ${TITLE}`)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: MOD }); run("layout.show", { id: "panel" }); }
        })
        .child(svg(`mods/${MOD}/document.svg`).size(14).flex_none()).child(TITLE));
  }
}
