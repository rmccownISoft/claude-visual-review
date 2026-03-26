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
