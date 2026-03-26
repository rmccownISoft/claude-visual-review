// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseSkillFile, collectMdFiles, listSkills, installSkillFromMd, saveSkillVersion, deleteSkill } from './skills'

let testDir: string

beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'skills-test-'))
})

afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
})

describe('collectMdFiles', () => {
    it('returns empty array for empty directory', async () => {
        const result = await collectMdFiles(testDir, 'SKILL.md')
        expect(result).toEqual([])
    })

    it('finds .md files in a flat directory', async () => {
        await writeFile(join(testDir, 'a.md'), 'content a')
        await writeFile(join(testDir, 'b.md'), 'content b')

        const result = await collectMdFiles(testDir, 'SKILL.md')
        expect(result).toHaveLength(2)
        expect(result).toContain(join(testDir, 'a.md'))
        expect(result).toContain(join(testDir, 'b.md'))
    })

    it('excludes the named file', async () => {
        await writeFile(join(testDir, 'SKILL.md'), 'skill content')
        await writeFile(join(testDir, 'reference.md'), 'ref content')

        const result = await collectMdFiles(testDir, 'SKILL.md')
        expect(result).toHaveLength(1)
        expect(result).toContain(join(testDir, 'reference.md'))
        expect(result).not.toContain(join(testDir, 'SKILL.md'))
    })

    it('finds .md files recursively in subdirectories', async () => {
        await mkdir(join(testDir, 'references'))
        await writeFile(join(testDir, 'references', 'guide.md'), 'guide')
        await writeFile(join(testDir, 'references', 'errors.md'), 'errors')

        const result = await collectMdFiles(testDir, 'SKILL.md')
        expect(result).toHaveLength(2)
        expect(result).toContain(join(testDir, 'references', 'guide.md'))
        expect(result).toContain(join(testDir, 'references', 'errors.md'))
    })

    it('ignores non-.md files', async () => {
        await writeFile(join(testDir, 'script.js'), 'code')
        await writeFile(join(testDir, 'data.json'), '{}')
        await writeFile(join(testDir, 'readme.md'), 'docs')

        const result = await collectMdFiles(testDir, 'SKILL.md')
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('readme.md')
    })

    it('handles deeply nested subdirectories', async () => {
        await mkdir(join(testDir, 'a', 'b', 'c'), { recursive: true })
        await writeFile(join(testDir, 'a', 'b', 'c', 'deep.md'), 'deep content')

        const result = await collectMdFiles(testDir, 'SKILL.md')
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('deep.md')
    })
})

describe('listSkills', () => {
    it('returns empty array when directory does not exist', async () => {
        const result = await listSkills('/nonexistent/path/that/does/not/exist')
        expect(result).toEqual([])
    })

    it('returns empty array for empty skills directory', async () => {
        const result = await listSkills(testDir)
        expect(result).toEqual([])
    })

    it('ignores directories without SKILL.md', async () => {
        await mkdir(join(testDir, 'not-a-skill'))
        await writeFile(join(testDir, 'not-a-skill', 'README.md'), 'not a skill')

        const result = await listSkills(testDir)
        expect(result).toEqual([])
    })

    it('reads a skill with no reference files', async () => {
        await mkdir(join(testDir, 'my-skill'))
        await writeFile(join(testDir, 'my-skill', 'SKILL.md'), `---
name: my-skill
description: Does something useful
---

## Instructions

Follow these steps.`)

        const result = await listSkills(testDir)
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('my-skill')
        expect(result[0].description).toBe('Does something useful')
        expect(result[0].content).toContain('## Instructions')
        expect(result[0].content).not.toContain('name:')
    })

    it('inlines reference files into skill content', async () => {
        await mkdir(join(testDir, 'my-skill', 'references'), { recursive: true })
        await writeFile(join(testDir, 'my-skill', 'SKILL.md'), `---
name: my-skill
description: A skill with references
---

Main content.`)
        await writeFile(join(testDir, 'my-skill', 'references', 'guide.md'), '# Guide\nHelpful info.')

        const result = await listSkills(testDir)
        expect(result).toHaveLength(1)
        expect(result[0].content).toContain('Main content.')
        expect(result[0].content).toContain('# Guide')
        expect(result[0].content).toContain('Helpful info.')
    })

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

    it('returns multiple skills', async () => {
        for (const name of ['skill-a', 'skill-b']) {
            await mkdir(join(testDir, name))
            await writeFile(join(testDir, name, 'SKILL.md'), `---
name: ${name}
description: Description for ${name}
---
Content for ${name}.`)
        }

        const result = await listSkills(testDir)
        expect(result).toHaveLength(2)
        expect(result.map(s => s.name).sort()).toEqual(['skill-a', 'skill-b'])
    })
})

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

describe('parseSkillFile', () => {
	it('parses a valid skill file', () => {
		const input = `---
name: my-skill
description: Use this when the user asks about availability
---

## Instructions

Do this thing.`
		const result = parseSkillFile(input)
		expect(result).not.toBeNull()
		expect(result?.name).toBe('my-skill')
		expect(result?.description).toBe('Use this when the user asks about availability')
		expect(result?.content).toContain('## Instructions')
	})

	it('handles quoted description', () => {
		const input = `---
name: test-skill
description: 'Use when things go wrong'
---
Body content`
		const result = parseSkillFile(input)
		expect(result?.description).toBe('Use when things go wrong')
	})

	it('returns null when name is missing', () => {
		const input = `---
description: Some description
---
Body`
		expect(parseSkillFile(input)).toBeNull()
	})

	it('returns null when description is missing', () => {
		const input = `---
name: my-skill
---
Body`
		expect(parseSkillFile(input)).toBeNull()
	})

	it('returns null with no frontmatter', () => {
		expect(parseSkillFile('Just plain markdown with no frontmatter')).toBeNull()
	})

	it('strips frontmatter from content', () => {
		const input = `---
name: my-skill
description: A description
---
This is the body`
		const result = parseSkillFile(input)
		expect(result?.content).toBe('This is the body')
		expect(result?.content).not.toContain('name:')
	})
})
