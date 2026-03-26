# Skill Management — Design Spec

**Date:** 2026-03-25
**Status:** Approved

## Goals

Enable non-technical users to iterate on skills quickly alongside an MCP server: upload in any format, create versioned copies, edit in-browser, and kick off test runs without leaving the editor.

---

## 1. Data Model

`Skill` gains an `id` field — the on-disk storage key (directory name or `.md` filename stem):

```ts
export type Skill = {
    id: string          // storage key: "open-sales-orders-v2" — used for deletion, skillMap, run config
    name: string        // frontmatter display name: "open-sales-orders"
    description: string
    content: string
}
```

`name` becomes display-only. All keys that previously used `name` as an identifier (`skillMap` in the run server, delete API, run config checkboxes) switch to `id`.

---

## 2. Upload Improvements

### Accepted formats
- `.skill` — ZIP archive with a `.skill` extension (same structure as `.zip`)
- `.zip` — existing format, unchanged
- `.md` — bare SKILL.md file (single skill, no reference files)

The file picker `accept` attribute expands to `.skill,.zip,.md`.

### Server routing
The POST handler in `src/routes/api/skills/+server.ts` branches on extension:
- `.skill` or `.zip` → `installSkillFromZip`
- `.md` → `installSkillFromMd` (new — writes the file directly to `SKILLS_DIR/<filename>`)

### `listSkills` changes
Two passes: existing directory scan + new bare `.md` file scan. Each entry sets `id` from the directory name or filename stem. Results merged before null-filtering.

### `deleteSkill` changes
Tries both the directory path and the `.md` file path (using `force: true` so missing paths are silently ignored).

### CRLF normalization
Already implemented — `parseSkillFile` normalizes `\r\n` → `\n` before parsing.

---

## 3. Skills Page — Grouped List

Skills are grouped by base name (strip trailing `-vN` suffix) and rendered as a family:

- Family header shows the base `name` and description, plus a version count badge
- Versions nest under it with Edit and Delete per row
- The highest-numbered version (or the original if only one exists) gets a **latest** badge
- Single-version families still render in the grouped structure for consistency

---

## 4. Skill Editor Page

**Route:** `/skills/[id]/edit`

### Layout
- **Top:** Full-width markdown editor for the raw `SKILL.md` content (including frontmatter). The user edits the complete file — name, description, metadata, and body.
- **Bottom:** Collapsible run config panel. "Save as vN" and "▶ Run" buttons live in the panel header so they're always visible even when the config is collapsed.

### Run config fields
Same fields as the New Run page: MCP Server URL, headers, prompt, setup prompt, max steps, disabled tools. The currently-edited skill is automatically included — no need to select it separately. Other installed skills can be added via checkboxes.

### Config persistence
Config is saved to `localStorage` keyed by base skill name (e.g. `open-sales-orders`). All versions of a skill family share the same saved config, so returning to edit `v3` after running `v2` finds the config pre-filled.

---

## 5. Save-as-New-Version

When the user clicks "Save as vN":

1. Strip any existing `-vN` suffix from the current `id` to get the base name.
2. Scan installed skills for the highest existing version number in that family.
3. Create a new directory `<base>-v<N+1>` and write the editor content there as `SKILL.md`.
4. The original skill is never modified.
5. The editor navigates to the new version's edit page (e.g. `/skills/open-sales-orders-v3/edit`).

**Button label** is dynamic: editing `open-sales-orders` shows "Save as v2"; editing `open-sales-orders-v2` shows "Save as v3".

The editor content is saved as-is — if the user has manually updated `metadata.version` in the frontmatter, that change is preserved. There is no automatic frontmatter mutation.

---

## 6. Running from the Editor

Clicking **▶ Run** submits the run config with the current skill included, identical to the New Run page flow. On completion it navigates to the run results page.

The run results page gets a **"Edit skill →"** link pointing back to the editor for the skill that was used (if exactly one skill was in the run). This closes the iteration loop: results → back to editor → tweak → run again.

---

## Files Affected

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `id` to `Skill` type |
| `src/lib/server/skills.ts` | `listSkills` two-pass scan, `id` population, `deleteSkill` dual-path, `installSkillFromMd` |
| `src/routes/api/skills/+server.ts` | Branch upload on extension |
| `src/routes/api/skills/[name]/+server.ts` | Switch deletion key to `id` |
| `src/routes/api/run/+server.ts` | `skillMap` keys on `id` |
| `src/routes/skills/+page.svelte` | Grouped family list, Edit buttons, expanded file picker |
| `src/routes/skills/[id]/edit/+page.svelte` | New — editor + run config + save-as-version |
| `src/routes/skills/[id]/edit/+page.server.ts` | New — load skill by id |
| `src/routes/runs/[id]/+page.svelte` | Add "Edit skill →" back-link |
| `src/routes/+page.svelte` | Skill checkboxes key on `id` |
