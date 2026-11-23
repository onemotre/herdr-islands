import { exec } from "herdr";
import { join } from "./catalog.js";

export const parentDir = file => file.slice(0, file.lastIndexOf("/")) || "/";

export function markdownTarget(url, file) {
  // Split URL delimiters before decoding, so %23 and %3F can occur in file names.
  let path = url.trim().split(/[?#]/, 1)[0];
  if (!path) return null; // In-document anchors are not file navigation.
  if (/^file:\/\/(?:localhost)?\//i.test(path)) path = path.replace(/^file:\/\/(?:localhost)?(?=\/)/i, "");
  else if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  try { path = decodeURIComponent(path); } catch { throw new Error("Invalid Markdown link."); }
  if (path.startsWith("//") || /[\\\x00-\x1f\x7f]/.test(path) || !/\.(md|markdown)$/i.test(path)) return null;
  return path.startsWith("/") ? path : join(parentDir(file), path);
}

// Resolve on the document's machine. Both roots and targets are canonicalized
// before comparison: a relative path or symlink cannot escape the allowed roots.
const RESOLVE = `
command -v realpath >/dev/null 2>&1 || exit 5
file=$(realpath "$1" 2>/dev/null) || exit 2
shift
for folder do
  root=$(realpath "$folder" 2>/dev/null) || continue
  case "$file" in
    "\${root%/}"/*)
      [ -f "$file" ] || exit 2
      printf '%s\\n' "$file"
      exit 0 ;;
  esac
done
exit 3
`;

export async function resolveMarkdownTarget(path, roots, on) {
  if (!roots.length) throw new Error("Add the target folder in Plans → Sources first.");
  const result = await exec("sh", ["-c", RESOLVE, "plans-link", path, ...roots], { on, timeout: 4000 });
  if (result.code === 2) throw new Error("Linked Markdown file not found.");
  if (result.code === 3) throw new Error("Link points outside the configured folders and current project.");
  if (result.code !== 0) throw new Error("Cannot resolve the linked file on this machine (requires realpath).");
  const file = result.stdout.replace(/\r?\n$/, "");
  if (!/\.(md|markdown)$/i.test(file)) throw new Error("Link does not point to a Markdown file.");
  return file;
}
