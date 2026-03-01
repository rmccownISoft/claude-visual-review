import { json, error } from '@sveltejs/kit'
import { loadRun, updateAnnotation } from '$lib/server/runs'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
	const run = await loadRun(params.id)
	if (!run) throw error(404, 'Run not found')
	return json(run)
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { notes } = await request.json() as { notes: string }
	const success = await updateAnnotation(params.id, notes)
	if (!success) throw error(404, 'Run not found') // Let Svelte handle 
	return json({ ok: true })
}
