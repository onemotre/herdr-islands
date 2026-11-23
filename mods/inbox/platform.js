// Use the desktop's opener, never interpret a path or URL as shell source.
import { exec, notify, window } from "herdr";

export async function openPath(path) {
  try {
    const result = await exec(window()?.platform === "macos" ? "open" : "xdg-open", [path]);
    if (result.code !== 0) throw new Error(result.stderr.trim() || "Desktop opener failed");
  } catch (error) {
    notify({ title: "Could not open", body: String(error?.message ?? error), level: "warning" });
  }
}
