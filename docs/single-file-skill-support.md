# Single-File Skill Support

Support uploading a bare `.md` file as a skill, in addition to the existing ZIP-based install flow.

---

## Current Architecture

Skills are stored as directories under `data/skills/<name>/`, each containing a `SKILL.md` with YAML frontmatter (`name`, `description`) and optional supporting `.md` reference files that get inlined at load time.

The three layers involved:

| Layer | File | Responsibility |
|---|---|---|
| Storage/parsing | `src/lib/server/skills.ts` | Read, parse, install, delete |
| API | `src/routes/api/skills/+server.ts` | HTTP POST (ZIP upload) |
| UI | `src/routes/skills/+page.svelte` | File picker + install button |

---

## Required Changes

### 1. `src/lib/server/skills.ts`

#### `listSkills` — also scan for `.md` files

Currently filters to directories only:

```ts
entries.filter(e => e.isDirectory())
```

Add a second pass for bare `.md` files in the skills dir:

```ts
const fileResults = await Promise.all(
    entries
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(async (entry) => {
            const raw = await readFile(join(dir, entry.name), 'utf-8')
            return parseSkillFile(raw)
        })
)
```

Merge both result arrays before filtering nulls.

#### `deleteSkill` — handle both directories and files

The `name` key is derived from the directory/file name (see note below). Try both:

```ts
export async function deleteSkill(name: string): Promise<void> {
    await rm(join(SKILLS_DIR, name), { recursive: true, force: true })
    await rm(join(SKILLS_DIR, `${name}.md`), { force: true })
}
```

`rm` with `force: true` silently ignores missing paths, so this is safe even when only one exists.

#### Add `installSkillFromMd`

```ts
export async function installSkillFromMd(buffer: Uint8Array, filename: string): Promise<string> {
    const raw = new TextDecoder().decode(buffer)
    const skill = parseSkillFile(raw)
    if (!skill) throw new Error('File is missing required name/description frontmatter')
    await mkdir(SKILLS_DIR, { recursive: true })
    await writeFile(join(SKILLS_DIR, filename), buffer)
    return skill.name
}
```

---

### 2. `src/routes/api/skills/+server.ts`

Branch on uploaded file extension before dispatching to the appropriate installer:

```ts
const buffer = new Uint8Array(await file.arrayBuffer())
try {
    const name = file.name.endsWith('.md')
        ? await installSkillFromMd(buffer, file.name)
        : await installSkillFromZip(buffer)
    return json({ name }, { status: 201 })
} catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 })
}
```

Also import `installSkillFromMd` at the top.

---

### 3. `src/routes/skills/+page.svelte`

Two small UI updates:

1. Expand the file input's `accept` attribute:
   ```html
   accept=".md,.zip"
   ```

2. Update the descriptive text to mention both options:
   ```
   Upload a .md file (single skill) or a ZIP containing a skill directory with a SKILL.md at its root.
   ```

---

## Key Decision: Name vs. Storage Key

The `Skill.name` field comes from the frontmatter (`name: my-skill`), but the **storage key** used for deletion is the directory/filename on disk. These can differ.

**Options:**

**A. Use filename stem as the storage key (recommended)**
- Store `my-skill.md` on disk, expose `{ name: "my-skill", ... }` where `name` is the stem
- Frontmatter `name:` becomes display metadata only, or must match the stem
- Simple: delete always knows where to look

**B. Add a `slug` field to the `Skill` type**
- `Skill` gets `slug: string` (the on-disk name) alongside `name` (display name)
- `listSkills` populates `slug` from `entry.name` (stem for files, dir name for directories)
- Delete API uses `slug`, not `name`
- More flexible but requires a type change and UI update

Option A is simpler and sufficient for single-file skills. Option B is worth considering if skills ever need human-readable display names that differ from their filenames.
