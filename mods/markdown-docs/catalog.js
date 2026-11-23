import { exec, home } from "herdr";

export const FILE_LIMIT = 2000;
export const FOLDER_LIMIT = 8;
const EXCLUDED = [".git", "node_modules", ".venv", "__pycache__", ".cache", ".pytest_cache", "target", "dist", "build"];
const windows = (path) => /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(path);
export const join = (root, rel) => `${root}${root.endsWith("/") ? "" : "/"}${rel}`;
export const basename = (path) => path.split("/").filter(Boolean).at(-1) ?? path;
export const key = (machine, path) => JSON.stringify([machine, path]);

export function directory(path) {
  if (typeof path !== "string" || !path) return null;
  const normalized = windows(path) ? path.replace(/\\/g, "/") : path;
  if (!normalized.startsWith("/") && !/^[a-z]:\//i.test(normalized)) return null;
  if (/^[a-z]:\/$/i.test(normalized)) return normalized;
  return normalized.replace(/\/+$/, "") || "/";
}

export function displayPath(path, on = null) {
  const base = directory(home());
  if (!on && base && path.startsWith(`${base}/`)) return `~${path.slice(base.length)}`;
  return on ? `${on}: ${path}` : path;
}

export function projectDirectory(path, on) {
  const dir = directory(path);
  // Do not implicitly index a whole home or filesystem when a plain shell starts.
  if (!dir || dir === "/" || /^[a-z]:\/$/i.test(dir) || (!on && dir === directory(home()))) return null;
  return dir;
}

export async function gitRoot(cwd, on) {
  try {
    const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on, timeout: 3000 });
    if (r.code === 0) return projectDirectory(r.stdout.replace(/\r?\n$/, ""), on) ?? cwd;
  } catch { /* A non-Git folder (or a machine without Git) is still a source. */ }
  return cwd;
}

export async function scan(source) {
  const args = ["--no-config", "--files", "--hidden", "--maxdepth", "24", "--sort", "path", "-0",
    "--type-add", "docsmd:*.{[mM][dD],[mM][aA][rR][kK][dD][oO][wW][nN]}", "--type", "docsmd",
    ...EXCLUDED.flatMap(name => ["-g", `!${name}`])];
  if (!source.project) args.push("--no-ignore");
  // Relative, NUL-separated file names preserve Unicode, whitespace and newlines.
  const r = await exec("rg", args, { cwd: source.root, on: source.on, timeout: 12000 });
  if (r.code !== 0 && !(r.code === 1 && !r.stderr && !r.stdout)) {
    throw new Error(r.stderr.trim().split("\n")[0] || `ripgrep exited with code ${r.code}`);
  }
  const paths = r.stdout.split("\0").filter(Boolean);
  const rel = paths.slice(0, FILE_LIMIT).map(path => windows(source.root) ? path.replace(/\\/g, "/") : path);
  return { nodes: tree(rel), count: rel.length, limited: paths.length > FILE_LIMIT };
}

export function tree(paths) {
  const root = new Map();
  for (const path of paths) {
    const names = path.split("/");
    if (names.some(n => !n || n === "." || n === "..")) continue;
    let map = root, prefix = "";
    for (let i = 0; i < names.length; i++) {
      const name = names[i], rel = prefix + name, dir = i < names.length - 1;
      if (!map.has(name)) map.set(name, { name, rel, dir, children: dir ? new Map() : null });
      if (dir) map = map.get(name).children;
      prefix = `${rel}/`;
    }
  }
  const sort = nodes => [...nodes.values()]
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
    .map(n => ({ ...n, children: n.dir ? sort(n.children) : null }));
  return sort(root);
}
