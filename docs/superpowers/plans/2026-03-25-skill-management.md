# Skill Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned skill storage, multi-format upload (.skill/.zip/.md), a grouped skills list, and an in-browser skill editor with save-as-new-version and direct run launching.

**Architecture:** A new `id` field (storage key) is added to `Skill` and propagates through the whole stack. Versioning logic lives in `src/lib/skillVersioning.ts`. The editor is a new SvelteKit route `/skills/[id]/edit` with a textarea editor and an embedded run config panel that persists to localStorage.

**Tech Stack:** SvelteKit, Svelte 5 ($state/$derived/$props), TypeScript, Vitest, Tailwind 4, fflate (zip)

---

## Task 1: Add `id` to Skill type + populate it in listSkills

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/skills.ts`
- Modify: `src/lib/server/skills.test.ts`

### Context

`Skill` currently has `{ name, description, content }`. `name` is the frontmatter field and is used as a key everywhere. We need `id` (the directory/filename stem) as the stable storage key. `name` becomes display-only.

- [ ] **Step 1: Update the Skill type**

In `src/lib/types.ts`, change:

```ts
export type Skill = {
    name: string
    description: string
    content: string
}
```

to:

```ts
export type Skill = {
    id: string          // storage key: directory name or .md filename stem (e.g. "open-sales-orders-v2")
    name: string        // frontmatter display name (e.g. "open-sales-orders")
    description: string
    content: string
}
```

- [ ] **Step 2: Write the failing tests for id population**

In `src/lib/server/skills.test.ts`, add to the `listSkills` describe block:

```ts
it('populates id from directory name', async () => {
    await mkdir(join(testDir, 'my-skill'))
    await writeFile(join(testDir, 'my-skill', 'SKILL.md'), `---
name: my-skill
description: Does something useful
---
Body content`)

    const result = await listSkills(testDir)
    expect(result[0].id).toBe('my-skill')
})

it('id differs from frontmatter name when directory has version suffix', async () => {
    await mkdir(join(testDir, 'my-skill-v2'))
    await writeFile(join(testDir, 'my-skill-v2', 'SKILL.md'), `---
name: my-skill
description: Does something useful
---
Body content`)

    const result = await listSkills(testDir)
    expect(result[0].id).toBe('my-skill-v2')
    expect(result[0].name).toBe('my-skill')
})
```

- [ ] **Step 3: Run tests to verify they fail**

```
npx vitest run src/lib/server/skills.test.ts
```

Expected: tests fail with `TypeError: Cannot read properties of undefined (reading 'id')`

- [ ] **Step 4: Update listSkills to set id from entry.name**

In `src/lib/server/skills.ts`, update the directory-scan map callback. Find the line `return skill` near the end of the `.map(async (entry) => {` callback and change:

```ts
                return skill
```

to:

```ts
                skill.id = entry.name
                return skill
```

Also update `parseSkillFile` return to include a placeholder `id` so TypeScript is satisfied. Change the return statement in `parseSkillFile`:

```ts
    return { name, description, content: body }
```

to:

```ts
    return { id: '', name, description, content: body }
```

(`id` is always overwritten by the caller — the empty string is intentional.)

- [ ] **Step 5: Run tests to verify they pass**

```
npx vitest run src/lib/server/skills.test.ts
```

Expected: all tests pass (existing tests may have TypeScript errors on `skill.id` access — that's fine for now, they don't test `id` yet so they still pass at runtime)

- [ ] **Step 6: Fix existing test assertions that check the full skill object shape**

Check if any existing test uses `toEqual` with a full skill object shape. If so, add `id: 'my-skill'` to those expected objects. Run tests again to confirm all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/server/skills.ts src/lib/server/skills.test.ts
git commit -m "feat: add id field to Skill type, populate from directory name"
```

---

## Task 2: Upload improvements — .md files, .skill extension, dual-path delete, saveSkillVersion

**Files:**
- Modify: `src/lib/server/skills.ts`
- Modify: `src/lib/server/skills.test.ts`
- Modify: `src/routes/api/skills/+server.ts`
- Modify: `src/routes/api/skills/[name]/+server.ts`
- Modify: `src/routes/skills/+page.svelte`

### Context

Currently only `.zip` upload is supported and `listSkills` only scans directories. We're adding: bare `.md` file scanning, `installSkillFromMd`, `saveSkillVersion` (for the editor), dual-path `deleteSkill`, `.skill` extension support, and a `PUT` handler.

- [ ] **Step 1: Write failing tests for new server functions**

Add to `src/lib/server/skills.test.ts`:

```ts
describe('installSkillFromMd', () => {
    it('installs a valid .md skill file', async () => {
        const content = `---
name: my-skill
description: A test skill
---
Body content`
        await installSkillFromMd(new TextEncoder().encode(content), 'my-skill.md', testDir)
        const skills = await listSkills(testDir)
        expect(skills).toHaveLength(1)
        expect(skills[0].id).toBe('my-skill')
        expect(skills[0].name).toBe('my-skill')
    })

    it('throws when SKILL.md is missing frontmatter', async () => {
        const content = 'Just plain markdown'
        await expect(
            installSkillFromMd(new TextEncoder().encode(content), 'bad.md', testDir)
        ).rejects.toThrow('missing required name/description frontmatter')
    })
})

describe('saveSkillVersion', () => {
    it('writes content to a new skill directory', async () => {
        const content = `---
name: my-skill
description: A test skill
---
Updated body`
        await saveSkillVersion('my-skill-v2', content, testDir)
        const skills = await listSkills(testDir)
        expect(skills).toHaveLength(1)
        expect(skills[0].id).toBe('my-skill-v2')
        expect(skills[0].content).toBe('Updated body')
    })

    it('throws when content has no valid frontmatter', async () => {
        await expect(
            saveSkillVersion('my-skill-v2', 'no frontmatter', testDir)
        ).rejects.toThrow('missing required name/description frontmatter')
    })
})

describe('listSkills with bare .md files', () => {
    it('lists a bare .md file as a skill', async () => {
        await writeFile(join(testDir, 'bare-skill.md'), `---
name: bare-skill
description: A bare skill
---
Content`)
        const result = await listSkills(testDir)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('bare-skill')
        expect(result[0].name).toBe('bare-skill')
    })

    it('lists both directory and bare .md skills together', async () => {
        await mkdir(join(testDir, 'dir-skill'))
        await writeFile(join(testDir, 'dir-skill', 'SKILL.md'), `---
name: dir-skill
description: Directory skill
---
Content`)
        await writeFile(join(testDir, 'bare-skill.md'), `---
name: bare-skill
description: Bare skill
---
Content`)
        const result = await listSkills(testDir)
        expect(result).toHaveLength(2)
        expect(result.map(s => s.id).sort()).toEqual(['bare-skill', 'dir-skill'])
    })

    it('ignores .md files with invalid frontmatter', async () => {
        await writeFile(join(testDir, 'invalid.md'), 'no frontmatter here')
        const result = await listSkills(testDir)
        expect(result).toEqual([])
    })
})

describe('deleteSkill dual-path', () => {
    it('deletes a directory-based skill', async () => {
        await mkdir(join(testDir, 'my-skill'))
        await writeFile(join(testDir, 'my-skill', 'SKILL.md'), `---
name: my-skill
description: Skill
---
Content`)
        await deleteSkill('my-skill', testDir)
        const result = await listSkills(testDir)
        expect(result).toEqual([])
    })

    it('deletes a bare .md skill', async () => {
        await writeFile(join(testDir, 'my-skill.md'), `---
name: my-skill
description: Skill
---
Content`)
        await deleteSkill('my-skill', testDir)
        const result = await listSkills(testDir)
        expect(result).toEqual([])
    })

    it('does not throw when neither path exists', async () => {
        await expect(deleteSkill('nonexistent', testDir)).resolves.not.toThrow()
    })
})
```

Also add `installSkillFromMd` and `saveSkillVersion` to the import at the top of the test file:

```ts
import { parseSkillFile, collectMdFiles, listSkills, installSkillFromMd, saveSkillVersion, deleteSkill } from './skills'
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/lib/server/skills.test.ts
```

Expected: failures on `installSkillFromMd`, `saveSkillVersion`, and the new `listSkills`/`deleteSkill` tests.

- [ ] **Step 3: Implement new server functions**

In `src/lib/server/skills.ts`, replace the existing `deleteSkill` and add new functions. The full updated functions section (from `deleteSkill` onward):

```ts
export async function deleteSkill(name: string, dir = SKILLS_DIR): Promise<void> {
    await rm(join(dir, name), { recursive: true, force: true })
    await rm(join(dir, `${name}.md`), { force: true })
}

export async function installSkillFromMd(buffer: Uint8Array, filename: string, dir = SKILLS_DIR): Promise<string> {
    const raw = new TextDecoder().decode(buffer)
    const skill = parseSkillFile(raw)
    if (!skill) throw new Error('SKILL.md is missing required name/description frontmatter')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, filename), raw, 'utf-8')
    return filename.replace(/\.md$/, '')
}

export async function saveSkillVersion(id: string, content: string, dir = SKILLS_DIR): Promise<void> {
    const skill = parseSkillFile(content)
    if (!skill) throw new Error('SKILL.md is missing required name/description frontmatter')
    const skillDir = join(dir, id)
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), content, 'utf-8')
}
```

Also update `listSkills` to add the bare `.md` scan pass. Replace the full function:

```ts
export async function listSkills(dir = SKILLS_DIR): Promise<Skill[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => null)
    if (!entries) return []

    // Pass 1: directory-based skills (existing behavior)
    const dirResults = await Promise.all(
        entries
            .filter(e => e.isDirectory())
            .map(async (entry) => {
                const skillDir = join(dir, entry.name)
                let raw: string
                try {
                    raw = await readFile(join(skillDir, 'SKILL.md'), 'utf-8')
                } catch {
                    return null
                }
                const skill = parseSkillFile(raw)
                if (!skill) return null
                skill.id = entry.name

                const extras = await collectMdFiles(skillDir, 'SKILL.md')
                if (extras.length > 0) {
                    const sections = await Promise.all(
                        extras.map(async (filePath) => {
                            const relPath = relative(skillDir, filePath)
                            const content = await readFile(filePath, 'utf-8')
                            return `\n\n---\n<!-- ${relPath} -->\n${content}`
                        })
                    )
                    skill.content += sections.join('')
                }
                return skill
            })
    )

    // Pass 2: bare .md file skills
    const mdResults = await Promise.all(
        entries
            .filter(e => e.isFile() && e.name.endsWith('.md'))
            .map(async (entry) => {
                const raw = await readFile(join(dir, entry.name), 'utf-8').catch(() => null)
                if (!raw) return null
                const skill = parseSkillFile(raw)
                if (!skill) return null
                skill.id = entry.name.replace(/\.md$/, '')
                return skill
            })
    )

    return [...dirResults, ...mdResults].filter((s): s is Skill => s !== null)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/lib/server/skills.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Update the API upload handler to support .skill and .md**

Replace the full `POST` handler in `src/routes/api/skills/+server.ts`:

```ts
import { json } from '@sveltejs/kit'
import { listSkills, installSkillFromZip, installSkillFromMd } from '$lib/server/skills'
import type { RequestHandler } from './$types'

export async function GET() {
    const skills = await listSkills()
    return json(skills)
}

export const POST: RequestHandler = async ({ request }) => {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
        return json({ error: 'Missing file' }, { status: 400 })
    }

    const buffer = new Uint8Array(await file.arrayBuffer())
    const name = file.name.toLowerCase()
    try {
        const id = name.endsWith('.md')
            ? await installSkillFromMd(buffer, file.name)
            : await installSkillFromZip(buffer)
        return json({ id }, { status: 201 })
    } catch (err) {
        return json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 422 }
        )
    }
}
```

- [ ] **Step 6: Add PUT handler for save-as-new-version**

Add to `src/routes/api/skills/[name]/+server.ts`:

```ts
import { deleteSkill, saveSkillVersion } from '$lib/server/skills'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const DELETE: RequestHandler = async ({ params }) => {
    await deleteSkill(params.name)
    return new Response(null, { status: 204 })
}

export const PUT: RequestHandler = async ({ params, request }) => {
    const { content } = await request.json() as { content: string }
    if (!content || typeof content !== 'string') {
        return json({ error: 'Missing content' }, { status: 400 })
    }
    try {
        await saveSkillVersion(params.name, content)
        return new Response(null, { status: 201 })
    } catch (err) {
        return json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 422 }
        )
    }
}
```

- [ ] **Step 7: Update the skills page file picker**

In `src/routes/skills/+page.svelte`, change the file input `accept` attribute:

```html
accept=".skill,.zip,.md"
```

And update the descriptive paragraph text:

```html
<p class="text-xs text-gray-500">
    Upload a <code>.md</code> file (single skill), a <code>.skill</code> or <code>.zip</code> archive containing a skill directory with a <code>SKILL.md</code> at its root.
</p>
```

Also update the install success message — the API now returns `id` not `name`:

```ts
uploadSuccess = `Installed "${body.id}"`
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/skills.ts src/lib/server/skills.test.ts src/routes/api/skills/+server.ts "src/routes/api/skills/[name]/+server.ts" src/routes/skills/+page.svelte
git commit -m "feat: add .md/.skill upload, saveSkillVersion, dual-path delete"
```

---

## Task 3: Update Skill.name→id in all consumers

**Files:**
- Modify: `src/routes/api/run/+server.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/skills/+page.svelte`

### Context

`skillMap` in the run server and checkbox keys in the New Run page currently use `s.name`. These must switch to `s.id` so versioned skills (`open-sales-orders-v2`) are distinguishable.

- [ ] **Step 1: Update skillMap in run server**

In `src/routes/api/run/+server.ts`, find:

```ts
const skillMap = new Map(config.skills.map(s => [s.name, s.content]))
```

Change to:

```ts
const skillMap = new Map(config.skills.map(s => [s.id, s.content]))
```

Also find the `loadSkill` tool's error message:

```ts
?? `Skill "${skillName}" not found. Available: ${[...skillMap.keys()].join(', ')}`
```

No change needed — it already uses `skillMap.keys()` which are now ids.

- [ ] **Step 2: Update skill checkboxes on the New Run page**

In `src/routes/+page.svelte`, `selectedSkillNames` is a `SvelteSet<string>` used to track selected skills. It currently keys on `skill.name`. Change all three references:

Find:
```ts
function toggleSkill(name: string) {
    selectedSkillNames.has(name) ? selectedSkillNames.delete(name) : selectedSkillNames.add(name)
}
```

Change to:
```ts
function toggleSkill(id: string) {
    selectedSkillNames.has(id) ? selectedSkillNames.delete(id) : selectedSkillNames.add(id)
}
```

Find:
```ts
const selectedSkills = data.skills.filter(s => selectedSkillNames.has(s.name))
```

Change to:
```ts
const selectedSkills = data.skills.filter(s => selectedSkillNames.has(s.id))
```

In the template, find:
```html
checked={selectedSkillNames.has(skill.name)}
onchange={() => toggleSkill(skill.name)}
```

Change to:
```html
checked={selectedSkillNames.has(skill.id)}
onchange={() => toggleSkill(skill.id)}
```

- [ ] **Step 3: Update delete fetch URL on skills page**

In `src/routes/skills/+page.svelte`, in the `remove` function, find:

```ts
const res = await fetch(`/api/skills/${name}`, { method: 'DELETE' })
```

The `name` parameter passed to `remove()` is currently `skill.name`. We need to pass `skill.id` instead. The `remove` function signature stays `remove(name: string)` — just update the call in the template. Find in the template:

```html
onclick={() => remove(skill.name)}
```

Change to:
```html
onclick={() => remove(skill.id)}
```

And the error message:
```ts
deleteError = `Failed to delete "${name}"`
```
stays as-is since `name` is now the id string passed in.

- [ ] **Step 4: Verify the app still builds**

```
npx svelte-check --tsconfig ./tsconfig.json
```

Fix any TypeScript errors that surfaced. Common ones: any place that spreads a `Skill` object into a context expecting the old shape without `id`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/run/+server.ts src/routes/+page.svelte src/routes/skills/+page.svelte
git commit -m "feat: use skill.id as key throughout (skillMap, checkboxes, delete)"
```

---

## Task 4: Skill versioning utilities

**Files:**
- Create: `src/lib/skillVersioning.ts`
- Create: `src/lib/skillVersioning.test.ts`

### Context

Two pure functions needed by the skills page and editor: `nextVersionId` (computes next storage id for save-as-new-version) and `groupSkillsByFamily` (groups a flat skill list into version families for the grouped UI).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/skillVersioning.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { nextVersionId, groupSkillsByFamily } from './skillVersioning'
import type { Skill } from './types'

function makeSkill(id: string, name: string): Skill {
    return { id, name, description: 'desc', content: 'body' }
}

describe('nextVersionId', () => {
    it('creates v2 from original (no suffix)', () => {
        expect(nextVersionId('my-skill', ['my-skill'])).toBe('my-skill-v2')
    })

    it('creates v3 from v2', () => {
        expect(nextVersionId('my-skill-v2', ['my-skill', 'my-skill-v2'])).toBe('my-skill-v3')
    })

    it('skips gaps — uses max+1, not count+1', () => {
        // v2 was deleted, v3 exists
        expect(nextVersionId('my-skill-v3', ['my-skill', 'my-skill-v3'])).toBe('my-skill-v4')
    })

    it('handles skill names with hyphens', () => {
        expect(nextVersionId('open-sales-orders', ['open-sales-orders'])).toBe('open-sales-orders-v2')
    })

    it('does not match partial names', () => {
        // 'my-skill-extra' should not count as a version of 'my-skill'
        expect(nextVersionId('my-skill', ['my-skill', 'my-skill-extra'])).toBe('my-skill-v2')
    })
})

describe('groupSkillsByFamily', () => {
    it('returns a single family for one skill', () => {
        const skills = [makeSkill('my-skill', 'my-skill')]
        const result = groupSkillsByFamily(skills)
        expect(result).toHaveLength(1)
        expect(result[0].baseName).toBe('my-skill')
        expect(result[0].members).toHaveLength(1)
        expect(result[0].members[0].isLatest).toBe(true)
    })

    it('groups versioned skills under the same family', () => {
        const skills = [
            makeSkill('my-skill', 'my-skill'),
            makeSkill('my-skill-v2', 'my-skill'),
            makeSkill('my-skill-v3', 'my-skill'),
        ]
        const result = groupSkillsByFamily(skills)
        expect(result).toHaveLength(1)
        expect(result[0].members).toHaveLength(3)
    })

    it('marks only the highest version as latest', () => {
        const skills = [
            makeSkill('my-skill', 'my-skill'),
            makeSkill('my-skill-v2', 'my-skill'),
            makeSkill('my-skill-v3', 'my-skill'),
        ]
        const result = groupSkillsByFamily(skills)
        const latest = result[0].members.filter(m => m.isLatest)
        expect(latest).toHaveLength(1)
        expect(latest[0].skill.id).toBe('my-skill-v3')
    })

    it('sorts members from original to highest version', () => {
        const skills = [
            makeSkill('my-skill-v3', 'my-skill'),
            makeSkill('my-skill', 'my-skill'),
            makeSkill('my-skill-v2', 'my-skill'),
        ]
        const result = groupSkillsByFamily(skills)
        const ids = result[0].members.map(m => m.skill.id)
        expect(ids).toEqual(['my-skill', 'my-skill-v2', 'my-skill-v3'])
    })

    it('keeps unrelated skills in separate families', () => {
        const skills = [
            makeSkill('skill-a', 'skill-a'),
            makeSkill('skill-b', 'skill-b'),
        ]
        const result = groupSkillsByFamily(skills)
        expect(result).toHaveLength(2)
    })

    it('does not group my-skill-extra with my-skill', () => {
        const skills = [
            makeSkill('my-skill', 'my-skill'),
            makeSkill('my-skill-extra', 'my-skill-extra'),
        ]
        const result = groupSkillsByFamily(skills)
        expect(result).toHaveLength(2)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/lib/skillVersioning.test.ts
```

Expected: module not found error.

- [ ] **Step 3: Implement skillVersioning.ts**

Create `src/lib/skillVersioning.ts`:

```ts
import type { Skill } from './types'

function versionNum(id: string): number {
    const m = id.match(/-v(\d+)$/)
    return m ? parseInt(m[1]) : 0
}

function baseName(id: string): string {
    return id.replace(/-v\d+$/, '')
}

/**
 * Returns the next storage id for a new version of the skill with the given currentId.
 * Scans existingIds to find the highest version in the same family and increments it.
 * Example: nextVersionId('my-skill', ['my-skill']) => 'my-skill-v2'
 *          nextVersionId('my-skill-v2', ['my-skill', 'my-skill-v2']) => 'my-skill-v3'
 */
export function nextVersionId(currentId: string, existingIds: string[]): string {
    const base = baseName(currentId)
    const familyRegex = new RegExp(`^${base.replace(/[-]/g, '\\$&')}(-v(\\d+))?$`)
    const versions = existingIds
        .flatMap(id => {
            const m = id.match(familyRegex)
            if (!m) return []
            return [m[2] ? parseInt(m[2]) : 0]
        })
    const max = versions.length > 0 ? Math.max(...versions) : 0
    return `${base}-v${max + 1}`
}

export type SkillFamilyMember = {
    skill: Skill
    isLatest: boolean
}

export type SkillFamily = {
    baseName: string
    displayName: string   // frontmatter name from any member
    description: string
    members: SkillFamilyMember[]  // sorted original → highest version
}

/**
 * Groups a flat list of skills into version families.
 * Skills with ids matching '<base>-v<N>' are grouped under '<base>'.
 * Within each family, members are sorted from original (no suffix) to highest version.
 */
export function groupSkillsByFamily(skills: Skill[]): SkillFamily[] {
    const map = new Map<string, Skill[]>()
    for (const skill of skills) {
        const base = baseName(skill.id)
        const arr = map.get(base) ?? []
        arr.push(skill)
        map.set(base, arr)
    }

    return [...map.entries()].map(([base, members]) => {
        const sorted = [...members].sort((a, b) => versionNum(a.id) - versionNum(b.id))
        const maxNum = Math.max(...sorted.map(s => versionNum(s.id)))
        return {
            baseName: base,
            displayName: members[0].name,
            description: members[0].description,
            members: sorted.map(s => ({
                skill: s,
                isLatest: versionNum(s.id) === maxNum
            }))
        }
    })
}

/** Human-readable label for a skill within its family. */
export function versionLabel(id: string): string {
    const m = id.match(/-v(\d+)$/)
    return m ? `v${m[1]}` : 'original'
}

/** Button label for save-as-new-version, given the current id and all existing ids. */
export function saveAsLabel(currentId: string, existingIds: string[]): string {
    const next = nextVersionId(currentId, existingIds)
    const m = next.match(/-v(\d+)$/)
    return m ? `Save as v${m[1]}` : 'Save as new version'
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/lib/skillVersioning.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skillVersioning.ts src/lib/skillVersioning.test.ts
git commit -m "feat: add nextVersionId and groupSkillsByFamily utilities"
```

---

## Task 5: Skills page — grouped family list

**Files:**
- Modify: `src/routes/skills/+page.svelte`

### Context

Replace the flat skill list with the grouped family view. Each family has a header (base name + description + version count badge). Within the family, each version row has a version label, "Edit" link, and "Delete" button. The highest version gets a "latest" badge.

- [ ] **Step 1: Rewrite the skills page**

Replace the full content of `src/routes/skills/+page.svelte`:

```svelte
<script lang="ts">
    import { invalidateAll } from '$app/navigation'
    import type { PageData } from './$types'
    import { groupSkillsByFamily, versionLabel } from '$lib/skillVersioning'

    let { data }: { data: PageData } = $props()

    let fileInput = $state<HTMLInputElement | null>(null)
    let uploading = $state(false)
    let uploadError = $state<string | null>(null)
    let uploadSuccess = $state<string | null>(null)
    let deletingId = $state<string | null>(null)
    let deleteError = $state<string | null>(null)

    let families = $derived(groupSkillsByFamily(data.skills))

    async function install() {
        const file = fileInput?.files?.[0]
        if (!file) return
        uploading = true
        uploadError = null
        uploadSuccess = null
        const formData = new FormData()
        formData.append('file', file)
        try {
            const res = await fetch('/api/skills', { method: 'POST', body: formData })
            const body = await res.json()
            if (!res.ok) {
                uploadError = body.error ?? `Error ${res.status}`
            } else {
                uploadSuccess = `Installed "${body.id}"`
                if (fileInput) fileInput.value = ''
                await invalidateAll()
            }
        } catch {
            uploadError = 'Network error'
        }
        uploading = false
    }

    async function remove(id: string) {
        deletingId = id
        deleteError = null
        try {
            const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' })
            if (!res.ok) {
                deleteError = `Failed to delete "${id}"`
            } else {
                await invalidateAll()
            }
        } catch {
            deleteError = 'Network error'
        }
        deletingId = null
    }
</script>

<div class="max-w-2xl mx-auto p-6 space-y-8">
    <h1 class="text-xl font-semibold text-gray-900">Skills</h1>

    <section class="space-y-3">
        <h2 class="text-sm font-medium text-gray-700">Installed</h2>
        {#if families.length === 0}
            <p class="text-sm text-gray-400">No skills installed.</p>
        {:else}
            <div class="divide-y divide-gray-100 rounded border border-gray-200">
                {#each families as family (family.baseName)}
                    <div class="px-4 py-3 space-y-2">
                        <!-- Family header -->
                        <div class="flex items-center justify-between">
                            <div>
                                <span class="text-sm font-medium text-gray-800">{family.displayName}</span>
                                <span class="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {family.members.length} {family.members.length === 1 ? 'version' : 'versions'}
                                </span>
                            </div>
                        </div>
                        <p class="text-xs text-gray-500">{family.description}</p>

                        <!-- Version rows -->
                        <div class="pl-3 border-l-2 border-gray-200 space-y-1.5">
                            {#each family.members as { skill, isLatest } (skill.id)}
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs text-gray-600">{versionLabel(skill.id)}</span>
                                        {#if isLatest && family.members.length > 1}
                                            <span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">latest</span>
                                        {/if}
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <a
                                            href="/skills/{skill.id}/edit"
                                            class="text-xs text-blue-600 hover:text-blue-800"
                                        >Edit</a>
                                        <button
                                            onclick={() => remove(skill.id)}
                                            disabled={deletingId === skill.id}
                                            class="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                                        >
                                            {deletingId === skill.id ? 'Deleting…' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
        {#if deleteError}
            <p class="text-xs text-red-600">{deleteError}</p>
        {/if}
    </section>

    <section class="space-y-3">
        <h2 class="text-sm font-medium text-gray-700">Install from file</h2>
        <p class="text-xs text-gray-500">
            Upload a <code>.md</code> file (single skill), or a <code>.skill</code> / <code>.zip</code> archive containing a skill directory with a <code>SKILL.md</code> at its root.
        </p>
        <div class="flex items-center gap-3">
            <input
                bind:this={fileInput}
                type="file"
                accept=".skill,.zip,.md"
                class="text-sm text-gray-600 file:mr-3 file:rounded file:border file:border-gray-300 file:bg-transparent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-50"
            />
            <button
                onclick={install}
                disabled={uploading}
                class="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {uploading ? 'Installing…' : 'Install'}
            </button>
        </div>
        {#if uploadError}
            <p class="text-xs text-red-600">{uploadError}</p>
        {/if}
        {#if uploadSuccess}
            <p class="text-xs text-green-600">{uploadSuccess}</p>
        {/if}
    </section>
</div>
```

- [ ] **Step 2: Verify app builds with no TypeScript errors**

```
npx svelte-check --tsconfig ./tsconfig.json
```

Fix any errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/routes/skills/+page.svelte
git commit -m "feat: grouped skill family list with version labels and Edit links"
```

---

## Task 6: Skill editor page — structure, editor, save-as-new-version

**Files:**
- Create: `src/routes/skills/[id]/edit/+page.server.ts`
- Create: `src/routes/skills/[id]/edit/+page.svelte`

### Context

The editor page loads the skill by id, shows the full SKILL.md content in a textarea, and lets the user save a new version via PUT `/api/skills/<newId>`. The run config panel is built here but wired up in Task 7.

- [ ] **Step 1: Add readRawSkillMd to skills.ts**

In `src/lib/server/skills.ts`, add after `saveSkillVersion`:

```ts
/**
 * Reads the raw SKILL.md content for a skill by id.
 * Tries directory-based skill first, then bare .md file.
 */
export async function readRawSkillMd(id: string, dir = SKILLS_DIR): Promise<string | null> {
    try {
        return await readFile(join(dir, id, 'SKILL.md'), 'utf-8')
    } catch {}
    try {
        return await readFile(join(dir, `${id}.md`), 'utf-8')
    } catch {}
    return null
}
```

- [ ] **Step 2: Create the server load file**

Create `src/routes/skills/[id]/edit/+page.server.ts`:

```ts
import { listSkills, readRawSkillMd } from '$lib/server/skills'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
    const skills = await listSkills()
    const skill = skills.find(s => s.id === params.id)
    if (!skill) throw error(404, 'Skill not found')
    const rawContent = await readRawSkillMd(params.id)
    if (!rawContent) throw error(404, 'Skill not found')
    const otherSkills = skills.filter(s => s.id !== params.id)
    return { skill, rawContent, otherSkills, allIds: skills.map(s => s.id) }
}
```

- [ ] **Step 3: Create the editor page**

Create `src/routes/skills/[id]/edit/+page.svelte`:

```svelte
<script lang="ts">
    import { goto } from '$app/navigation'
    import { SvelteSet } from 'svelte/reactivity'
    import { resolve } from '$app/paths'
    import type { PageData } from './$types'
    import { nextVersionId, saveAsLabel } from '$lib/skillVersioning'
    import type { RunConfig } from '$lib/types'

    let { data }: { data: PageData } = $props()

    // Editor state — rawContent preserves all frontmatter fields (metadata, mcp-server, etc.)
    let content = $state(data.rawContent)
    let saving = $state(false)
    let saveError = $state<string | null>(null)

    // Run config state — populated from localStorage on mount
    let configOpen = $state(true)
    let url = $state('')
    let headers = $state<{ key: string; value: string }[]>([])
    let prompt = $state('')
    let setupPrompt = $state('')
    let maxSteps = $state(20)
    let disabledTools = new SvelteSet<string>()
    let selectedOtherSkillIds = new SvelteSet<string>()
    let running = $state(false)
    let runError = $state<string | null>(null)

    const storageKey = `skill-editor-config-${data.skill.id.replace(/-v\d+$/, '')}`

    const nextId = $derived(nextVersionId(data.skill.id, data.allIds))
    const saveLabel = $derived(saveAsLabel(data.skill.id, data.allIds))

    // Load config from localStorage
    if (typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem(storageKey)
            if (saved) {
                const cfg = JSON.parse(saved)
                url = cfg.url ?? ''
                headers = cfg.headers ?? []
                prompt = cfg.prompt ?? ''
                setupPrompt = cfg.setupPrompt ?? ''
                maxSteps = cfg.maxSteps ?? 20
            }
        } catch {}
    }

    function persistConfig() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify({ url, headers, prompt, setupPrompt, maxSteps }))
        }
    }

    function addHeader() {
        headers = [...headers, { key: '', value: '' }]
    }

    function removeHeader(i: number) {
        headers = headers.filter((_, j) => j !== i)
    }

    async function saveAsVersion() {
        saving = true
        saveError = null
        try {
            const res = await fetch(`/api/skills/${nextId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                saveError = body.error ?? `Error ${res.status}`
            } else {
                await goto(resolve(`/skills/${nextId}/edit`))
            }
        } catch {
            saveError = 'Network error'
        }
        saving = false
    }
</script>

<div class="flex flex-col h-full">
    <!-- Breadcrumb -->
    <div class="px-6 py-3 border-b border-gray-200 text-xs text-gray-500 flex items-center gap-1.5">
        <a href="/skills" class="hover:text-gray-700">Skills</a>
        <span>/</span>
        <span class="text-gray-800 font-medium">{data.skill.id}</span>
        <span>/</span>
        <span>Edit</span>
    </div>

    <!-- Editor -->
    <div class="flex-1 flex flex-col min-h-0 p-4 gap-2">
        <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide" for="skill-editor">SKILL.md</label>
        <textarea
            id="skill-editor"
            bind:value={content}
            spellcheck="false"
            class="flex-1 font-mono text-sm rounded border border-gray-300 p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
        ></textarea>
    </div>

    <!-- Run config panel -->
    <div class="border-t border-gray-200 bg-white">
        <!-- Panel header — always visible -->
        <div class="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <button
                onclick={() => configOpen = !configOpen}
                class="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700"
            >
                <span class="transition-transform {configOpen ? 'rotate-90' : ''}">▶</span>
                Run Config
            </button>
            <div class="flex items-center gap-2">
                {#if saveError}
                    <span class="text-xs text-red-600">{saveError}</span>
                {/if}
                <button
                    onclick={saveAsVersion}
                    disabled={saving}
                    class="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    {saving ? 'Saving…' : saveLabel}
                </button>
                <button
                    disabled={running || !url.trim() || !prompt.trim()}
                    class="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {running ? 'Running…' : '▶ Run'}
                </button>
            </div>
        </div>

        <!-- Collapsible config fields -->
        {#if configOpen}
            <div class="px-4 py-3 space-y-3 max-h-72 overflow-y-auto">
                <div class="space-y-1">
                    <label class="text-xs font-medium text-gray-700" for="edit-url">MCP Server URL</label>
                    <input
                        id="edit-url"
                        bind:value={url}
                        oninput={persistConfig}
                        type="url"
                        placeholder="http://localhost:3001"
                        class="w-full rounded border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>

                <div class="space-y-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-gray-700">Headers</span>
                        <button onclick={addHeader} class="text-xs text-blue-600 hover:underline">+ Add</button>
                    </div>
                    {#each headers as header, i (i)}
                        <div class="flex gap-2">
                            <input bind:value={header.key} oninput={persistConfig} placeholder="key" class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <input bind:value={header.value} oninput={persistConfig} placeholder="value" class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <button onclick={() => removeHeader(i)} class="px-1.5 text-gray-400 hover:text-gray-600 text-sm">×</button>
                        </div>
                    {/each}
                </div>

                <div class="space-y-1">
                    <label class="text-xs font-medium text-gray-700" for="edit-setup">Setup Prompt <span class="font-normal text-gray-400">(optional)</span></label>
                    <textarea
                        id="edit-setup"
                        bind:value={setupPrompt}
                        oninput={persistConfig}
                        rows={2}
                        placeholder="e.g. login with user: x password: y"
                        class="w-full resize-y rounded border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    ></textarea>
                </div>

                <div class="space-y-1">
                    <label class="text-xs font-medium text-gray-700" for="edit-prompt">Prompt</label>
                    <textarea
                        id="edit-prompt"
                        bind:value={prompt}
                        oninput={persistConfig}
                        rows={3}
                        placeholder="Enter the prompt for the agent..."
                        class="w-full resize-y rounded border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    ></textarea>
                </div>

                <div class="flex items-center gap-3">
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-gray-700" for="edit-steps">Max Steps</label>
                        <input
                            id="edit-steps"
                            bind:value={maxSteps}
                            oninput={persistConfig}
                            type="number"
                            min={1}
                            max={100}
                            class="w-20 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {#if data.otherSkills.length > 0}
                    <div class="space-y-1">
                        <span class="text-xs font-medium text-gray-700">Additional Skills</span>
                        <div class="space-y-1">
                            {#each data.otherSkills as skill (skill.id)}
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedOtherSkillIds.has(skill.id)}
                                        onchange={() => selectedOtherSkillIds.has(skill.id) ? selectedOtherSkillIds.delete(skill.id) : selectedOtherSkillIds.add(skill.id)}
                                        class="rounded border-gray-300"
                                    />
                                    <span class="text-xs text-gray-700">{skill.id}</span>
                                </label>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
```

- [ ] **Step 4: Verify builds with no TypeScript errors**

```
npx svelte-check --tsconfig ./tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/skills.ts "src/routes/skills/[id]/edit/+page.server.ts" "src/routes/skills/[id]/edit/+page.svelte"
git commit -m "feat: skill editor page with textarea and save-as-new-version"
```

---

## Task 7: Run from editor + localStorage persistence + run results back-link

**Files:**
- Modify: `src/routes/skills/[id]/edit/+page.svelte`
- Modify: `src/routes/runs/[id]/+page.svelte`
- Modify: `src/routes/runs/[id]/+page.server.ts`

### Context

Wire the ▶ Run button in the editor to POST `/api/run`, navigate to run results on completion, and add an "Edit skill →" link on the run results page when exactly one skill was used.

- [ ] **Step 1: Wire the Run button in the editor**

In `src/routes/skills/[id]/edit/+page.svelte`, add the `startRun` function and wire the button. Add to the `<script>` block after `persistConfig`:

```ts
async function startRun() {
    running = true
    runError = null
    persistConfig()

    const mcpHeaders = Object.fromEntries(
        headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value])
    )
    const otherSelected = data.otherSkills.filter(s => selectedOtherSkillIds.has(s.id))
    const config: RunConfig = {
        mcpServerUrl: url,
        mcpHeaders,
        skills: [data.skill, ...otherSelected],
        prompt,
        maxSteps,
        setupPrompt: setupPrompt || undefined,
        disabledTools: []
    }

    let res: Response
    try {
        res = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config })
        })
    } catch (err) {
        runError = `Network error: ${err instanceof Error ? err.message : String(err)}`
        running = false
        return
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        runError = body.error ?? `Server error ${res.status}`
        running = false
        return
    }

    // Read stream to get runId, then navigate
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let capturedRunId: string | null = null

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
            try {
                const chunk = JSON.parse(line.slice(6)) as Record<string, unknown>
                if (chunk.type === 'data-runId') {
                    const d = chunk.data as Record<string, unknown>
                    if (typeof d?.runId === 'string') capturedRunId = d.runId
                } else if (chunk.type === 'error' && typeof chunk.errorText === 'string') {
                    runError = chunk.errorText
                }
            } catch {}
        }
    }

    running = false
    if (capturedRunId) {
        await goto(resolve(`/runs/${capturedRunId}`))
    } else if (!runError) {
        runError = 'Run failed — server did not return a run ID.'
    }
}
```

Update the ▶ Run button to call `startRun`:

```html
<button
    onclick={startRun}
    disabled={running || !url.trim() || !prompt.trim()}
    class="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
>
    {running ? 'Running…' : '▶ Run'}
</button>
```

Also add the run error display next to the save error in the panel header:

```html
{#if runError}
    <span class="text-xs text-red-600">{runError}</span>
{/if}
```

- [ ] **Step 2: Add "Edit skill →" link to run results page**

In `src/routes/runs/[id]/+page.svelte`, add the back-link to the annotation panel. The run's `config.skills` array now has `id` fields. If exactly one skill was used, show the link.

Add to the annotation `<aside>` block, just before the closing `</aside>`:

```html
{#if data.run.config.skills.length === 1 && data.run.config.skills[0].id}
    <div class="pt-2 border-t border-gray-100">
        <a
            href="/skills/{data.run.config.skills[0].id}/edit"
            class="text-xs text-blue-600 hover:text-blue-800"
        >
            Edit skill → {data.run.config.skills[0].id}
        </a>
    </div>
{/if}
```

- [ ] **Step 3: Verify builds with no TypeScript errors**

```
npx svelte-check --tsconfig ./tsconfig.json
```

Fix any errors before continuing.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/skills/[id]/edit/+page.svelte" src/routes/runs/[id]/+page.svelte
git commit -m "feat: run from editor with localStorage config, run results back-link"
```

---

## Final verification

- [ ] **Start the dev server and walk through the full flow**

```
npm run dev
```

1. Go to `/skills` — install `open-sales-orders/SKILL.md` directly (CRLF normalization should handle it)
2. Confirm it appears in the grouped list as "original" under the `open-sales-orders` family
3. Click Edit → confirm the editor opens with the full SKILL.md content
4. Make a small change, click "Save as v2" → confirm redirect to `/skills/open-sales-orders-v2/edit`
5. Go back to `/skills` → confirm both `original` and `v2` appear, `v2` has "latest" badge
6. Fill in run config, click ▶ Run → confirm navigation to run results
7. On run results → confirm "Edit skill → open-sales-orders-v2" link appears and navigates back correctly
8. Go to `/` (New Run) → confirm both versions appear as checkboxes, keyed by id

- [ ] **Run the full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Final commit**

```bash
git add .gitignore
git commit -m "chore: add .superpowers/ to .gitignore"
```
