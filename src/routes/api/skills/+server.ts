import { json } from '@sveltejs/kit'
import { listSkills } from '$lib/server/skills'
import type { RequestHandler } from './$types'
import { installSkillFromZip } from '$lib/server/skills'
// TODO: returns the full skill object including its content, if we start using a large number of skills, we should consider 
// a GET /api/skills/[name] to retrieve as needed
export async function GET() {
    const skills = await listSkills()
    return json(skills)
}

// Zip upload handler
export const POST: RequestHandler = async ({ request }) => {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
        return json({ error: 'Missing file' }, { status: 400 })
    }

    const buffer = new Uint8Array(await file.arrayBuffer())
    try {
        const name = await installSkillFromZip(buffer)
        return json({ name }, { status: 201 })
    } catch (err) {
        return json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 422 } //unprocessable entity for invalid zip content
        )
    }
}
