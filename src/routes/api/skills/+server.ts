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
