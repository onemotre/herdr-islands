# Islands

This file is the brief: enough to build **Islands** from an empty folder. The files next to it are one build of it, adapted from **relevo** and **na29-islands**.

## What you see

A floating-islands desktop workspace with `titlebar: "none"` and a `dim` backdrop row (`padding: 6px`, `gap: 6px`) over a configurable wallpaper, gradient, or palette-matched solid background:

1. **Left Sidebar (`268px`, collapsible to `44px`)**:
   - `sidebar-chrome` header: Herdr logo, `Go to` search button, and sidebar collapse toggle.
   - `workspaces`: Machines grouped with drag-to-reorder headers, `1px` dividers, and `8px` vertical gaps. Top-level spaces use bold hollow colored rings (`circle-dot` when active); git worktrees nest underneath with Font Awesome `code-branch` icons.
   - `agents-panel`: All agents grouped by directory basename, with folder headers (`10.5px`) and agent rows (`12.5px`).
   - `usage`: 5-hour and 7-day usage bars for Claude Code and Codex.
   - `sidebar-chrome` footer: `Settings` (`settings-panel`) and `Add machine` (`machine-add`) pills.
2. **Center Work Column**:
   - `tabs` row (`40px`, `gap: 4px`): `tabs-bar` (scrollable tabs + `Files` / `Changes` / `Git` segmented toggle), `insights` toolbar button, `inbox` button, `markdown-docs` toolbar button, right-panel toggle, and `window-controls` (macOS-style solid circles ordered `minimize`, `maximize`, `close` using `t.working`, `t.done`, `t.blocked`).
   - `work-body`: Active terminal panes (`pane-header` at `30px` top) beside a toggleable right panel (`368px` default, `hidden: true` initially) hosting `files-panel`, `changes-panel`, `git-graph`, `inbox`, `issues`, and `markdown-docs`.
   - `status-bar` (`32px`): CPU, memory, battery, music, dictation, agent activity counters, date, and time in soft pills.
   - Zero-height `keybinds` block syncing `rice.json` settings to `layouts/islands.json` and `keys.json`.

## Built from

- **Layout**: `layouts/islands.json`
- **Mods**:
  - Core islands & navigation: `workspaces`, `agents-panel`, `usage`, `sidebar-chrome`, `tabs-bar`, `pane-header`, `status-bar`, `keybinds`, `tmux-prefix`, `settings-panel`, `goto`, `prompt-dialog`, `window-controls`, `fa-icons`
  - Right-panel tools: `files-panel`, `changes-panel`, `git-graph`, `inbox`, `insights`, `issues`, `markdown-docs`
- **Themes**: `themes/*.json` (including `noctalia.json`)

## Done when

- `herdr-app check` passes for every mod under `mods/`.
- `herdr-app do layout.switch --name islands` loads with `"errors": []` in `herdr-app status`.
- Sidebar cards respond live to `Settings -> Sidebar -> Cards` (background, text color, font family, font size).
- Worktrees nest under their main repo with `code-branch` icons, active spaces show `circle-dot`, and window controls render solid theme-colored dots.
