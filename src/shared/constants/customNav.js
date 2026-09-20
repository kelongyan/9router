// Local menu customization — zero-conflict layer (this file does not exist upstream).
//
// Sidebar.js runs its navItems through applyCustomNav() before rendering, so menu
// changes are made HERE and never by editing Sidebar.js. Upstream merges then keep
// working without touching local customization. See docs/CUSTOMIZATION.md.

// Menu entries to hide, matched by href. Example:
//   export const HIDDEN_NAV = ["/dashboard/quota"];
// Prefer this over commenting an item out in Sidebar.js: an upstream merge silently
// restores a commented-out line, but never a hide declared here.
export const HIDDEN_NAV = [];

// Menu entries to add, appended after the built-in items. Shape:
//   { href: "/dashboard/my-tool", label: "My Tool", icon: "extension" }
// `icon` is a Material Symbols ligature name; `label` is the English source text
// (the runtime i18n layer translates it when a dictionary entry exists). The page
// itself goes in src/app/(dashboard)/dashboard/<module>/.
export const EXTRA_NAV = [];

// Apply HIDDEN_NAV + EXTRA_NAV to a sidebar nav item list. Pure, so it is safe to
// call at module scope. Entries are deduped by href: an item added here that
// upstream later ships in Sidebar.js renders once, not twice.
export function applyCustomNav(items) {
  const hidden = new Set(HIDDEN_NAV);
  const kept = items.filter((item) => !hidden.has(item.href));
  const known = new Set(kept.map((item) => item.href));
  const extra = EXTRA_NAV.filter((item) => !hidden.has(item.href) && !known.has(item.href));
  return [...kept, ...extra];
}
