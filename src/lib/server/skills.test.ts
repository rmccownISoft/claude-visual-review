import { describe, it, expect } from 'vitest'
import { parseSkillFile } from './skills'

// Examples for later, never used vitest
//expect(x).toBe('exact')        // strict equality (===)
//expect(x).toEqual({ a: 1 })    // deep equality (objects/arrays)
//expect(x).toBeNull()           // null check
//expect(x).not.toBeNull()       // negation — .not inverts any matcher
//expect(x).toContain('substr')  // string/array contains
//expect(x).toBeTruthy()         // truthy check

// Node vs vitest
// Node assert style:
//assert.strictEqual(result?.name, 'my-skill')

// Vitest expect style:
//expect(result?.name).toBe('my-skill')

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
