import { json } from '@sveltejs/kit'
import { listSkills } from '$lib/server/skills'

// TODO: returns the full skill object including its content, if we start using a large number of skills, we should consider 
// a GET /api/skills/[name] to retrieve as needed
export async function GET() {
    const skills = await listSkills()
    return json(skills)
}