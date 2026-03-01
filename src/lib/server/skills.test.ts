// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseSkillFile, collectMdFiles, listSkills } from './skills'

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
