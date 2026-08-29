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
