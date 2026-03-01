import { deleteSkill } from '$lib/server/skills'
import type { RequestHandler } from './$types'

// TODO: fix type
export const DELETE: RequestHandler = async ({ params }) => {
    await deleteSkill(params.name)
    return new Response(null, { status: 204 }) //success response, no body
}
