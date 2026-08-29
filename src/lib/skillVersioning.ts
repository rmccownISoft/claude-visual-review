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
            // original (no -vN suffix) counts as version 1
            return [m[2] ? parseInt(m[2]) : 1]
        })
    const max = versions.length > 0 ? Math.max(...versions) : 1
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
