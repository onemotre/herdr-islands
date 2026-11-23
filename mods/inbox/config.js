// Everything personal to one setup: accounts, contexts, folders and skills. Relevo's Settings rewrites this file.

// Each Claude account: `launcher` is the shell command that starts it, `claudeDir` its
// CLAUDE_CONFIG_DIR under home, `bg`/`fg` its chip colors.
export const ACCOUNTS = [
];

export const CODEX = { key: "codex", label: "Codex", letter: "X", launcher: "codex", bg: "#4fd6be", fg: "#1e2030" };

// The first context is the default. The others claim the repos whose GitHub owner is in `orgs`,
// and each gets a space folder with that key.
export const CONTEXTS = [
  { key: "codex", label: "Projects", account: "codex", color: "ansi6" },
];

// Who takes over when the repo's account is out of quota, in order.
export const FALLBACK = ["codex"];

// Clones live directly under this folder in home.
export const REPOS_ROOT = "Projects";

// Where Save patch and Save commits write, under home.
export const BACKUPS_ROOT = "relevo-backups";

// The slash commands the Inbox launches on a PR: a review, a CI fix and answering review comments.
export const SKILLS = { review: "review", fix: "fix-ci", comments: "address-comments" };

// What the quick replies menu offers to send an agent (⌥⌘S, or ↩ beside an agent).
export const REPLIES = ["Continue", "Tested and it works: commit and push", "Fix all of it"];
