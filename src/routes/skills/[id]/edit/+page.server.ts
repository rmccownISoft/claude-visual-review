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
